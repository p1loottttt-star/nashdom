// Замер живого эфира «свой фильм»: раз в секунду getStats у того, кто показывает, и у того, кто смотрит.
// Видно, где рвётся: кодировщик (cpu/bandwidth), сеть (потери, RTT, relay), приём (подвисания, сброшенные кадры, буфер).
// Сводка пишется в хранилище пары: caststat/<эфир>:<человек> — по ней разбираем жалобы «фризит» с настоящих сетей.
import * as store from './store.js';

const n = (x) => (Number.isFinite(x) ? x : 0);
const r1 = (x) => Math.round(x * 10) / 10;

export function watchCast(pc, { role, sid, video }) {
  let prev = null, last = 0;
  const S = { role, sid, at: Date.now(), samples: [], sum: null };
  (window.__cast ||= {})[role] = S;
  async function tick() {
    if (pc.connectionState === 'closed') return stop();
    const rep = await pc.getStats().catch(() => null); if (!rep) return;
    const cur = { t: performance.now() }, by = (type, kind) => [...rep.values()].find((s) => s.type === type && (!kind || s.kind === kind));
    const pair = [...rep.values()].find((s) => s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded');
    const loc = pair && rep.get(pair.localCandidateId), rem = pair && rep.get(pair.remoteCandidateId);
    if (role === 'host') {
      const o = by('outbound-rtp', 'video'), ri = by('remote-inbound-rtp', 'video');
      if (!o) return;
      Object.assign(cur, { bytes: n(o.bytesSent), enc: n(o.framesEncoded), encT: n(o.totalEncodeTime), retx: n(o.retransmittedBytesSent), nack: n(o.nackCount), pli: n(o.pliCount),
        fps: n(o.framesPerSecond), w: o.frameWidth, hgt: o.frameHeight, lim: o.qualityLimitationReason, impl: o.encoderImplementation, target: n(o.targetBitrate),
        lost: n(ri?.packetsLost), rtt: n(ri?.roundTripTime) * 1000 });
    } else {
      const i = by('inbound-rtp', 'video'), a = by('inbound-rtp', 'audio');
      if (!i) return;
      Object.assign(cur, { bytes: n(i.bytesReceived), dec: n(i.framesDecoded), decT: n(i.totalDecodeTime), drop: n(i.framesDropped), frz: n(i.freezeCount), frzT: n(i.totalFreezesDuration),
        jb: n(i.jitterBufferDelay), jbN: n(i.jitterBufferEmittedCount), lost: n(i.packetsLost), got: n(i.packetsReceived), nack: n(i.nackCount),
        fps: n(i.framesPerSecond), w: i.frameWidth, hgt: i.frameHeight, impl: i.decoderImplementation, conceal: n(a?.concealedSamples), samples: n(a?.totalSamplesReceived), aLvl: n(a?.audioLevel) });
    }
    Object.assign(cur, { rtt2: n(pair?.currentRoundTripTime) * 1000, out: n(pair?.availableOutgoingBitrate), via: loc ? `${loc.candidateType}/${loc.protocol}→${rem?.candidateType}` : '' });
    if (video?.getVideoPlaybackQuality) { const q = video.getVideoPlaybackQuality(); Object.assign(cur, { vDrop: q.droppedVideoFrames, vTot: q.totalVideoFrames }); }
    if (prev) {
      const dt = (cur.t - prev.t) / 1000, d = (k) => n(cur[k] - prev[k]);
      const s = { s: Math.round((cur.t - (S.t0 ||= prev.t)) / 1000), fps: r1(cur.fps), kbps: Math.round((d('bytes') * 8) / dt / 1000), res: `${cur.w || 0}x${cur.hgt || 0}`, rtt: Math.round(cur.rtt2 || cur.rtt), lost: d('lost'), nack: d('nack'), via: cur.via };
      if (role === 'host') Object.assign(s, { lim: cur.lim, encMs: d('enc') ? r1((d('encT') / d('enc')) * 1000) : 0, retxKbps: Math.round((d('retx') * 8) / dt / 1000), pli: d('pli'), outKbps: Math.round(cur.out / 1000), targetKbps: Math.round(cur.target / 1000), impl: cur.impl, srcDrop: d('vDrop') });
      else Object.assign(s, { drop: d('drop'), frz: d('frz'), frzMs: Math.round(d('frzT') * 1000), jbMs: d('jbN') ? Math.round((d('jb') / d('jbN')) * 1000) : 0, decMs: d('dec') ? r1((d('decT') / d('dec')) * 1000) : 0, audioGap: d('samples') ? r1((d('conceal') / d('samples')) * 100) : 0, alvl: Math.round(n(cur.aLvl) * 1000), impl: cur.impl });
      S.samples.push(s); if (S.samples.length > 900) S.samples.shift();
      S.sum = summary(S.samples, role);
      if (Date.now() - last > 15000 && S.samples.length > 5) { last = Date.now(); store.put('caststat', `${sid}:${store.me().id}`, { role, sid, at: S.at, ua: navigator.userAgent.slice(0, 160), ...S.sum }).catch(() => {}); }
    }
    prev = cur;
  }
  const id = setInterval(tick, 1000);
  function stop() { clearInterval(id); }
  return stop;
}

// сводка: средние и худшие значения + счётчики проблем
export function summary(xs, role) {
  if (!xs.length) return null;
  const avg = (k) => r1(xs.reduce((a, x) => a + n(x[k]), 0) / xs.length), min = (k) => Math.min(...xs.map((x) => n(x[k]))), sum = (k) => xs.reduce((a, x) => a + n(x[k]), 0);
  const low = xs.filter((x) => x.fps < 20).length;
  const out = { secs: xs.length, fps: avg('fps'), fpsMin: min('fps'), lowSecs: low, kbps: Math.round(avg('kbps')), rtt: Math.round(avg('rtt')), lost: sum('lost'), nack: sum('nack'), via: xs.at(-1).via, res: xs.at(-1).res, impl: xs.at(-1).impl };
  if (role === 'host') {
    const lim = {}; for (const x of xs) lim[x.lim] = (lim[x.lim] || 0) + 1;
    Object.assign(out, { lim, encMs: avg('encMs'), outKbps: Math.round(avg('outKbps')), targetKbps: Math.round(avg('targetKbps')), pli: sum('pli'), srcDrop: sum('srcDrop') });
  } else Object.assign(out, { freezes: sum('frz'), freezeMs: sum('frzMs'), dropped: sum('drop'), jbMs: Math.round(avg('jbMs')), decMs: avg('decMs'), audioGap: avg('audioGap'), alvl: avg('alvl') });
  return out;
}
