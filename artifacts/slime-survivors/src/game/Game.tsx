import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  startGameLoop,
  stopGameLoop,
  resumeGameLoop,
  advanceChestReward,
  canUseRemovalAction,
  getRunAbilityTargets,
  increaseAbilityMaxLevel,
  removeAbilityFromRun,
} from './gameLoop';
import { initInput, teardownInput, Input } from './input';
import { AbilityTarget, State, GameStatus, UpgradeOptions } from './state';
import { Difficulty, HeroType } from './entities';
import { render } from './renderer';
import { Lang, getLang, setLang, t } from './lang';
import { loadSprites } from './sprites';

type AppScreen = 'MENU' | 'DIFFICULTY' | 'HERO' | 'SETTINGS' | 'GAME';

// ─── Virtual Joystick ─────────────────────────────────────────────────────────
const OUTER_R = 56;
const INNER_R = 22;

function Joystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ active: false, id: -1, cx: 0, cy: 0 });

  const show = (cx: number, cy: number) => {
    if (baseRef.current) {
      baseRef.current.style.opacity = '1';
      baseRef.current.style.left = `${cx - OUTER_R}px`;
      baseRef.current.style.top = `${cy - OUTER_R}px`;
    }
    if (knobRef.current)
      knobRef.current.style.transform = `translate(${OUTER_R - INNER_R}px, ${OUTER_R - INNER_R}px)`;
  };

  const moveKnob = (kx: number, ky: number) => {
    const dx = kx - stateRef.current.cx;
    const dy = ky - stateRef.current.cy;
    const dist = Math.hypot(dx, dy);
    const clamp = Math.min(dist, OUTER_R - INNER_R);
    const angle = Math.atan2(dy, dx);
    const rx = Math.cos(angle) * clamp;
    const ry = Math.sin(angle) * clamp;
    if (knobRef.current)
      knobRef.current.style.transform =
        `translate(${OUTER_R - INNER_R + rx}px, ${OUTER_R - INNER_R + ry}px)`;
    const norm = dist > 6 ? clamp / (OUTER_R - INNER_R) : 0;
    Input.touchDx = dist > 6 ? Math.cos(angle) * norm : 0;
    Input.touchDy = dist > 6 ? Math.sin(angle) * norm : 0;
  };

  const hide = () => {
    if (baseRef.current) baseRef.current.style.opacity = '0';
    Input.touchDx = 0; Input.touchDy = 0;
  };

  useEffect(() => {
    const el = document.getElementById('joystick-zone');
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      if (stateRef.current.active) return;
      const touch = e.changedTouches[0];
      stateRef.current = { active: true, id: touch.identifier, cx: touch.clientX, cy: touch.clientY };
      show(touch.clientX, touch.clientY);
    };
    const onMove = (e: TouchEvent) => {
      if (!stateRef.current.active) return;
      e.preventDefault();
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === stateRef.current.id) moveKnob(touch.clientX, touch.clientY);
      }
    };
    const onEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === stateRef.current.id) {
          stateRef.current.active = false; hide();
        }
      }
    };
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: false });
    el.addEventListener('touchcancel', onEnd, { passive: false });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  return (
    <div ref={baseRef} className="pointer-events-none absolute select-none"
      style={{ width: OUTER_R*2, height: OUTER_R*2, borderRadius: '50%',
        background: 'rgba(255,255,255,0.12)', border: '3px solid rgba(255,255,255,0.3)',
        opacity: 0, transition: 'opacity 0.1s' }}>
      <div ref={knobRef} className="absolute"
        style={{ width: INNER_R*2, height: INNER_R*2, borderRadius: '50%',
          background: 'rgba(255,255,255,0.5)', border: '2px solid rgba(255,255,255,0.8)' }} />
    </div>
  );
}

// ─── Slime icon (uses real sprite) ───────────────────────────────────────────
function assetUrl(path: string) {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
  return `${base}${path}`;
}

function SlimeIcon({ hero = 'blue', size = 80 }: { hero?: HeroType; size?: number }) {
  const src = assetUrl(hero === 'green'  ? '/sprites/slime_green1.png' :
              hero === 'purple' ? '/sprites/slime_purple1.png' :
                                  '/sprites/slime1.png');
  return (
    <div className="animate-bounce" style={{ width: size, height: size }}>
      <img src={src} alt="slime" style={{ width: size, height: size, imageRendering: 'pixelated' }} />
    </div>
  );
}

function Bubbles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <style>{`@keyframes float{from{transform:translateY(0)}to{transform:translateY(-14px)}}`}</style>
      {Array.from({ length: 14 }, (_, i) => (
        <div key={i} className="absolute rounded-full opacity-10"
          style={{ width: 20 + (i * 37) % 80, height: 20 + (i * 37) % 80,
            left: `${(i * 13 + 5) % 95}%`, top: `${(i * 19 + 10) % 90}%`,
            background: '#88ccff',
            animation: `float ${3+(i%4)}s ease-in-out ${i*0.4}s infinite alternate` }} />
      ))}
    </div>
  );
}

// ─── Shared button styles ─────────────────────────────────────────────────────
const BtnPrimary: React.CSSProperties = {
  padding: '16px 0', borderRadius: 14, fontSize: 'clamp(1rem,4vw,1.3rem)',
  background: 'linear-gradient(180deg,#2f80ed 0%,#1a55c0 100%)',
  border: '3px solid #0f3a9a', boxShadow: '0 5px 0 #0a2a6e', color: '#fff',
};
const BtnSecondary: React.CSSProperties = {
  padding: '13px 0', borderRadius: 12, fontSize: 'clamp(0.8rem,3.5vw,1rem)',
  background: 'rgba(255,255,255,0.08)', border: '2px solid rgba(100,160,255,0.35)',
  color: '#a8d4ff',
};
const VolumeButton: React.CSSProperties = {
  width: 52, height: 46, borderRadius: 12, fontSize: '1.8rem',
  lineHeight: 1, background: 'rgba(255,255,255,0.08)',
  border: '2px solid rgba(100,160,255,0.3)', color: '#a8d4ff',
};

type InfoData = { title: string; description: string };

type UpgradeKind = UpgradeOptions['kind'];

const CARD_COLORS: Record<UpgradeKind, string> = {
  stat: '#86a9ff',
  weapon: '#5ee4ff',
  mini: '#ffd15a',
};

const CARD_IMAGE_FILTERS: Record<UpgradeKind, string> = {
  stat: 'sepia(1) saturate(6) hue-rotate(185deg) brightness(1.15)',
  weapon: 'sepia(1) saturate(7) hue-rotate(145deg) brightness(1.15)',
  mini: 'sepia(1) saturate(7) hue-rotate(350deg) brightness(1.1)',
};

function InfoButton({
  onClick,
  label,
  tint,
}: {
  onClick: () => void;
  label: string;
  tint?: UpgradeKind;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      className="absolute flex items-center justify-center font-mono font-black transition-all active:scale-90"
      style={{
        top: 8, right: 8, width: 32, height: 32, borderRadius: '50%',
        background: 'transparent', border: 0, padding: 0,
        color: '#fff', fontSize: '1.1rem', lineHeight: 1, zIndex: 2,
      }}
    >
      <img
        src={assetUrl('/ui/info-question.png')}
        alt=""
        draggable={false}
        style={{
          width: 32, height: 32, imageRendering: 'pixelated',
          filter: tint ? CARD_IMAGE_FILTERS[tint] : 'none',
        }}
      />
    </button>
  );
}

function InfoModal({ info, onClose }: { info: InfoData | null; onClose: () => void }) {
  if (!info) return null;
  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-6 select-none"
      style={{ zIndex: 100, background: 'rgba(2,8,25,0.82)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={info.title}
        className="relative w-full rounded-2xl px-6 py-6 text-center font-mono"
        style={{
          maxWidth: 330, background: 'linear-gradient(160deg,#1a376d,#0c1b3d)',
          border: '2px solid #6caeff', boxShadow: '0 8px 0 #07152f, 0 0 28px rgba(80,160,255,0.35)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label={t('back')}
          className="absolute flex items-center justify-center font-mono font-black"
          style={{
            top: 8, right: 10, width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.35)',
            color: '#fff', fontSize: '1rem',
          }}
        >
          ×
        </button>
        <div style={{ color: '#8dccff', fontSize: 'clamp(1rem,4vw,1.25rem)', fontWeight: 900, paddingRight: 25 }}>
          {info.title}
        </div>
        <div
          className="mt-4 whitespace-pre-line"
          style={{ color: '#e4efff', fontSize: 'clamp(0.82rem,3.5vw,1rem)', lineHeight: 1.6 }}
        >
          {info.description}
        </div>
      </div>
    </div>
  );
}

// ─── Main Game Component ──────────────────────────────────────────────────────
export function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [screen, setScreen] = useState<AppScreen>('MENU');
  const [lang, setLangState] = useState<Lang>(getLang());
  const [gameStatus, setGameStatus] = useState<GameStatus>('PLAYING');
  const [upgrades, setUpgrades] = useState<UpgradeOptions[]>([]);
  const [gameStats, setGameStats] = useState({ time: 0, kills: 0, level: 1 });
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [hero, setHero] = useState<HeroType>('blue');
  const [spritesReady, setSpritesReady] = useState(false);
  const [musicVol, setMusicVol] = useState(0.5);
  const [pauseSettingsOpen, setPauseSettingsOpen] = useState(false);
  const [info, setInfo] = useState<InfoData | null>(null);
  const [removalStep, setRemovalStep] = useState<'idle' | 'remove' | 'boost'>('idle');

  // Background music
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicStarted = useRef(false);

  useEffect(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
    const audio = new Audio(`${base}/music_bg.m4a`);
    audio.loop = true;
    audio.volume = musicVol;
    audioRef.current = audio;

    const pauseForAppLifecycle = () => {
      audio.pause();
    };
    const resumeAfterAppLifecycle = () => {
      if (!document.hidden && musicStarted.current && audio.paused) {
        audio.play().catch(() => {
          // A user gesture may be required after returning from the background.
        });
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) pauseForAppLifecycle();
      else resumeAfterAppLifecycle();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pagehide', pauseForAppLifecycle);
    window.addEventListener('beforeunload', pauseForAppLifecycle);
    window.addEventListener('blur', pauseForAppLifecycle);
    window.addEventListener('focus', resumeAfterAppLifecycle);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pagehide', pauseForAppLifecycle);
      window.removeEventListener('beforeunload', pauseForAppLifecycle);
      window.removeEventListener('blur', pauseForAppLifecycle);
      window.removeEventListener('focus', resumeAfterAppLifecycle);
      audio.pause();
      audio.currentTime = 0;
      audio.removeAttribute('src');
      audio.load();
      audioRef.current = null;
      musicStarted.current = false;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVol;
  }, [musicVol]);

  const tryPlayMusic = () => {
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().then(() => {
        musicStarted.current = true;
      }).catch(() => {
        // Autoplay blocked — will retry on next user gesture
      });
    }
  };

  const stopMusic = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    musicStarted.current = false;
  };

  const changeLang = (l: Lang) => { setLang(l); setLangState(l); };

  useEffect(() => {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
    loadSprites(base).then(() => setSpritesReady(true));
  }, []);

  const handleStateChange = useCallback((newState: typeof State) => {
    setGameStatus(newState.status);
    if (newState.status === 'LEVEL_UP' || (newState.status === 'CHEST' && !newState.chestReward)) {
      setUpgrades([...newState.upgradeChoices]);
    }
    if (newState.status === 'GAME_OVER') {
      setGameStats({ time: newState.timeSurvived, kills: newState.kills, level: newState.level });
    }
  }, []);

  useEffect(() => {
    if (screen !== 'GAME') return;
    if (!spritesReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    setGameStatus('PLAYING');
    initInput();
    startGameLoop(canvas, handleStateChange, difficulty, hero);
    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (State.status !== 'PLAYING') {
        const ctx = canvas.getContext('2d')!;
        render(ctx, State, canvas.width, canvas.height);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); stopGameLoop(); teardownInput(); };
  }, [screen, spritesReady, handleStateChange, difficulty, hero]);

  const onStartGame = (d: Difficulty) => { setDifficulty(d); setScreen('HERO'); };
  const onPickHero  = (h: HeroType)   => {
    setHero(h);
    setRemovalStep('idle');
    tryPlayMusic();
    setScreen('GAME');
  };
  const onGoMenu    = () => { stopMusic(); setPauseSettingsOpen(false); setScreen('MENU'); };

  const onUpgrade = (upgrade: UpgradeOptions) => {
    upgrade.apply(State);
    if (advanceChestReward()) {
      setUpgrades([...State.upgradeChoices]);
      setGameStatus('CHEST');
      return;
    }
    State.invincibilityTimer = 3.0;
    setGameStatus('PLAYING');
    if (canvasRef.current) resumeGameLoop(canvasRef.current, handleStateChange);
  };

  const onClaimArtifact = () => {
    if (State.chestReward?.type === 'artifact') {
      State.collectedArtifactIds.push(State.chestReward.artifact.id);
      State.chestReward = null;
    }
    if (advanceChestReward()) {
      setUpgrades([...State.upgradeChoices]);
      setGameStatus('CHEST');
      return;
    }
    State.invincibilityTimer = 2.0;
    setGameStatus('PLAYING');
    if (canvasRef.current) resumeGameLoop(canvasRef.current, handleStateChange);
  };

  const onStartRemoval = () => {
    if (canUseRemovalAction()) setRemovalStep('remove');
  };

  const onRemoveAbility = (ability: AbilityTarget) => {
    if (removeAbilityFromRun(ability.id)) setRemovalStep('boost');
  };

  const onBoostAbility = (ability: AbilityTarget) => {
    if (!increaseAbilityMaxLevel(ability.id)) return;
    setRemovalStep('idle');
    State.invincibilityTimer = 3.0;
    setGameStatus('PLAYING');
    if (canvasRef.current) resumeGameLoop(canvasRef.current, handleStateChange);
  };

  const onPlayAgain = () => { stopMusic(); setScreen('MENU'); setTimeout(() => setScreen('DIFFICULTY'), 10); };
  const showInfo = (title: string, description: string) => setInfo({ title, description });

  const onPause  = () => { stopGameLoop(); State.status = 'PAUSED'; setGameStatus('PAUSED'); };
  const onResume = () => {
    setPauseSettingsOpen(false);
    setGameStatus('PLAYING');
    if (canvasRef.current) resumeGameLoop(canvasRef.current, handleStateChange);
  };

  useEffect(() => {
    if (screen !== 'GAME') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (State.status === 'PLAYING') onPause();
        else if (State.status === 'PAUSED') onResume();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [screen]);

  const fmtTime = (s: number) =>
    `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;

  const BG = { background: 'linear-gradient(160deg,#0d1b3e 0%,#0f3460 50%,#1a5276 100%)' };

  // ── MAIN MENU ────────────────────────────────────────────────────────────────
  if (screen === 'MENU') return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none" style={BG}>
      <Bubbles />
      <SlimeIcon hero="blue" size={90} />
      <h1 className="mt-5 mb-1 font-mono font-black text-center leading-none"
        style={{ fontSize:'clamp(2rem,8vw,3.5rem)', color:'#7ec8ff', textShadow:'0 4px 0 #0d3b6e', letterSpacing:'0.08em' }}>
        SLIME
      </h1>
      <h1 className="mb-8 font-mono font-black text-center leading-none"
        style={{ fontSize:'clamp(1.4rem,6vw,2.5rem)', color:'#4488ff', textShadow:'0 3px 0 #0d2d6e', letterSpacing:'0.12em' }}>
        SURVIVORS
      </h1>
      <div className="flex flex-col gap-2 w-full px-6" style={{ maxWidth: 390 }}>
        <button onClick={() => { tryPlayMusic(); setScreen('DIFFICULTY'); }}
          className="transition-all active:scale-95 flex items-center justify-center"
          style={{ background:'transparent', border:0, padding:0, height:'clamp(128px,34vw,150px)' }}
          aria-label={t('start')}>
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/ui/${lang === 'ru' ? 'start-ru' : 'start-en'}.png`}
            alt={t('start')} draggable={false}
            style={{ width:'clamp(205px,62vw,240px)', height:'clamp(128px,34vw,150px)', objectFit:'contain', imageRendering:'pixelated' }}
          />
        </button>
        <button onClick={() => setScreen('SETTINGS')}
          className="transition-all active:scale-95 flex items-center justify-center"
          style={{ background:'transparent', border:0, padding:0, height:'clamp(128px,34vw,150px)' }}
          aria-label={t('settings')}>
          <img
            src={`${import.meta.env.BASE_URL.replace(/\/$/, '')}/ui/${lang === 'ru' ? 'settings-ru' : 'settings-en'}.png`}
            alt={t('settings')} draggable={false}
            style={{ width:'clamp(205px,62vw,240px)', height:'clamp(128px,34vw,150px)', objectFit:'contain', imageRendering:'pixelated' }}
          />
        </button>
      </div>
      <p className="mt-8 font-mono text-center px-6 opacity-40"
        style={{ color:'#a0c4ff', fontSize:'clamp(0.65rem,2.5vw,0.85rem)' }}>
        {t('moveHint')}
      </p>
    </div>
  );

  // ── DIFFICULTY SELECTION ─────────────────────────────────────────────────────
  if (screen === 'DIFFICULTY') return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none" style={BG}>
      <Bubbles />
      <h2 className="mb-8 font-mono font-black tracking-widest"
        style={{ fontSize:'clamp(1.4rem,6vw,2rem)', color:'#7ec8ff', textShadow:'0 3px 0 #0d3b6e' }}>
        {t('difficulty')}
      </h2>
      <div className="flex flex-col gap-3 w-full px-8" style={{ maxWidth: 340 }}>
        {([ ['easy','diffEasy','diffEasyDesc','#22aa44','#0a5522'],
             ['medium','diffMedium','diffMediumDesc','#dd9900','#664400'],
             ['hard','diffHard','diffHardDesc','#cc2222','#660000'] ] as const).map(([d, labelKey, descKey, color, shadow]) => (
          <div key={d} className="relative">
            <button onClick={() => onStartGame(d)}
              className="w-full font-mono font-black tracking-widest text-white transition-all active:scale-95"
              style={{ padding:'17px 48px 17px 16px', borderRadius:14, fontSize:'clamp(0.9rem,3.5vw,1.1rem)',
                background:`linear-gradient(180deg,${color} 0%,${shadow} 100%)`,
                border:`3px solid ${shadow}`, boxShadow:`0 4px 0 ${shadow}` }}>
              {t(labelKey)}
            </button>
            <InfoButton
              label={`${t(labelKey)} — ${t('info')}`}
              onClick={() => showInfo(t(labelKey), t(descKey))}
            />
          </div>
        ))}
        <button onClick={() => setScreen('MENU')} className="font-mono font-bold tracking-widest transition-all active:scale-95 mt-2" style={BtnSecondary}>
          ← {t('back')}
        </button>
      </div>
      <InfoModal info={info} onClose={() => setInfo(null)} />
    </div>
  );

  // ── HERO SELECTION ───────────────────────────────────────────────────────────
  if (screen === 'HERO') return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none" style={BG}>
      <Bubbles />
      <h2 className="mb-6 font-mono font-black tracking-widest"
        style={{ fontSize:'clamp(1.4rem,6vw,2rem)', color:'#7ec8ff', textShadow:'0 3px 0 #0d3b6e' }}>
        {t('selectHero')}
      </h2>
      <div className="flex flex-col gap-3 w-full px-6" style={{ maxWidth: 360 }}>
        {([
          { h: 'blue'   as HeroType, labelKey: 'heroBlue'   as const, descKey: 'heroBlueDesc'   as const, color: '#2266ee', border: '#0f3a9a', glow: '#4488ff' },
          { h: 'green'  as HeroType, labelKey: 'heroGreen'  as const, descKey: 'heroGreenDesc'  as const, color: '#1a7a22', border: '#0a4a10', glow: '#44dd00' },
          { h: 'purple' as HeroType, labelKey: 'heroPurple' as const, descKey: 'heroPurpleDesc' as const, color: '#5a1a88', border: '#330066', glow: '#bb44ff' },
        ]).map(({ h, labelKey, descKey, color, border, glow }) => (
          <div key={h} className="relative">
            <button onClick={() => onPickHero(h)}
              className="w-full font-mono font-black text-white transition-all active:scale-95 flex items-center gap-4 text-left"
              style={{ padding:'14px 54px 14px 16px', borderRadius:16,
                background:`linear-gradient(135deg,${color} 0%,${border} 100%)`,
                border:`2px solid ${glow}`, boxShadow:`0 0 14px ${glow}44` }}>
              <SlimeIcon hero={h} size={52} />
              <div className="flex-1" style={{ fontSize:'clamp(1rem,4vw,1.15rem)', letterSpacing:'0.05em' }}>
                {t(labelKey)}
              </div>
            </button>
            <InfoButton
              label={`${t(labelKey)} — ${t('info')}`}
              onClick={() => showInfo(t(labelKey), t(descKey))}
            />
          </div>
        ))}
        <button onClick={() => setScreen('DIFFICULTY')} className="font-mono font-bold tracking-widest transition-all active:scale-95 mt-2" style={BtnSecondary}>
          ← {t('back')}
        </button>
      </div>
      <InfoModal info={info} onClose={() => setInfo(null)} />
    </div>
  );

  // ── SETTINGS ─────────────────────────────────────────────────────────────────
  if (screen === 'SETTINGS') return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden select-none" style={BG}>
      <Bubbles />
      <h2 className="mb-8 font-mono font-black tracking-widest"
        style={{ fontSize:'clamp(1.4rem,6vw,2.2rem)', color:'#7ec8ff', textShadow:'0 3px 0 #0d3b6e' }}>
        {t('settings')}
      </h2>
      <div className="flex flex-col gap-6 w-full px-8 rounded-2xl py-8"
        style={{ maxWidth:340, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(100,160,255,0.2)' }}>
        {/* Language */}
        <div className="flex flex-col items-center gap-3">
          <p className="font-mono font-bold tracking-widest" style={{ color:'#a8d4ff', fontSize:'clamp(0.8rem,3vw,1rem)' }}>
            {t('language')}
          </p>
          <div className="flex gap-3">
            {(['ru','en'] as Lang[]).map(l => (
              <button key={l} onClick={() => changeLang(l)}
                className="font-mono font-black tracking-widest transition-all active:scale-95"
                style={{ width:90, padding:'12px 0', borderRadius:12, fontSize:'1rem',
                  background: lang===l ? 'linear-gradient(180deg,#2f80ed 0%,#1a55c0 100%)' : 'rgba(255,255,255,0.08)',
                  border: lang===l ? '3px solid #0f3a9a' : '2px solid rgba(100,160,255,0.25)',
                  color: lang===l ? '#fff' : '#7ec8ff',
                  boxShadow: lang===l ? '0 4px 0 #0a2a6e' : '0 2px 0 rgba(0,0,0,0.3)' }}>
                {l==='ru' ? '🇷🇺 RU' : '🇬🇧 EN'}
              </button>
            ))}
          </div>
        </div>
        {/* Music volume */}
        <div className="flex flex-col items-center gap-3">
          <p className="font-mono font-bold tracking-widest" style={{ color:'#a8d4ff', fontSize:'clamp(0.8rem,3vw,1rem)' }}>
            {t('musicVol')}: {Math.round(musicVol * 100)}%
          </p>
            <div className="flex items-center gap-4">
              <button onClick={() => setMusicVol(v => Math.max(0, parseFloat((v - 0.1).toFixed(1))))}
                className="font-mono font-black transition-all active:scale-90"
                style={VolumeButton} aria-label={t('volDown')}>−</button>
              <span className="font-mono font-black text-center" style={{ minWidth:58, color:'#fff', fontSize:'1.15rem' }}>
                {Math.round(musicVol * 100)}%
              </span>
              <button onClick={() => setMusicVol(v => Math.min(1, parseFloat((v + 0.1).toFixed(1))))}
                className="font-mono font-black transition-all active:scale-90"
                style={VolumeButton} aria-label={t('volUp')}>+</button>
            </div>
            <div style={{ width:'100%', height:7, borderRadius:4, background:'rgba(255,255,255,0.1)', overflow:'hidden' }}>
              <div style={{ width:`${musicVol*100}%`, height:'100%', borderRadius:4, background:'linear-gradient(90deg,#2f80ed,#7ec8ff)', transition:'width 0.15s' }} />
            </div>
          </div>
      </div>
      <button onClick={() => setScreen('MENU')} className="mt-8 font-mono font-bold tracking-widest transition-all active:scale-95" style={{ ...BtnSecondary, padding:'13px 40px' }}>
        ← {t('back')}
      </button>
    </div>
  );

  // ── GAME SCREEN ──────────────────────────────────────────────────────────────
  return (
    <div className="relative w-full h-full overflow-hidden bg-[#3d6b4a]">
      {!spritesReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-50">
          <p className="font-mono text-white text-xl animate-pulse">Loading sprites…</p>
        </div>
      )}

      <canvas ref={canvasRef} className="block w-full h-full" style={{ touchAction:'none' }} />

      {/* Joystick zone — RIGHT half */}
      <div id="joystick-zone" className="absolute inset-y-0 right-0"
        style={{ width:'50%', touchAction:'none' }} />
      <Joystick />

      {/* Pause button — TOP CENTER */}
      {gameStatus === 'PLAYING' && (
        <button onClick={onPause}
          className="absolute font-mono font-black text-white transition-all active:scale-90 select-none"
          style={{ top:10, left:'50%', transform:'translateX(-50%)',
            width:48, height:40, borderRadius:10, fontSize:'1.2rem',
            background:'rgba(0,0,0,0.45)', border:'2px solid rgba(255,255,255,0.25)',
            display:'flex', alignItems:'center', justifyContent:'center' }}
          aria-label={t('pause')}>
          ⏸
        </button>
      )}

      {/* ── PAUSE overlay ── */}
      {gameStatus === 'PAUSED' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-y-auto"
          style={{ background:'rgba(5,15,40,0.88)', backdropFilter:'blur(4px)' }}>
          <h2 className="font-mono font-black tracking-widest mb-4"
            style={{ fontSize:'clamp(1.6rem,7vw,2.5rem)', color:'#7ec8ff', textShadow:'0 3px 0 #0d3b6e' }}>
            ⏸ {t('pause')}
          </h2>
          <div className="w-full mb-4 rounded-2xl overflow-hidden"
            style={{ maxWidth:350, marginInline:16, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(100,160,255,0.25)' }}>
            <div className="font-mono font-black tracking-widest text-center py-2"
              style={{ fontSize:'0.78rem', color:'#4488ff', background:'rgba(0,0,100,0.3)', letterSpacing:'0.2em' }}>
              {t('pauseStats')}
            </div>
            <div className="px-5 pt-3 pb-2">
              <div className="flex justify-between font-mono mb-1" style={{ fontSize:'0.8rem', color:'#aaa' }}>
                <span>{t('statHP')}</span>
                <span style={{ color:'#fff', fontWeight:700 }}>{Math.ceil(State.player.currentHP)} / {Math.ceil(State.player.maxHP)}</span>
              </div>
              <div style={{ height:8, borderRadius:4, background:'#222', overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4, transition:'width 0.3s',
                  width:`${Math.max(0,Math.min(100,(State.player.currentHP/State.player.maxHP)*100))}%`,
                  background: State.player.currentHP/State.player.maxHP > 0.5 ? '#22cc44' :
                    State.player.currentHP/State.player.maxHP > 0.25 ? '#ddcc00' : '#ee2222' }} />
              </div>
            </div>
            {[
              { label: t('statSize'),        value: (State.player.baseMaxHP/100).toFixed(1),                                       color:'#66ffaa' },
              { label: t('statSpeed'),       value: `${(State.player.speed*State.stats.moveSpeedMultiplier*(State.hasArtifact('swift')?1.25:1)).toFixed(0)}`, color:'#66ddff' },
              { label: t('statDamage'),      value: `×${State.stats.damageMultiplier.toFixed(2)}`,                                 color:'#ff8844' },
              { label: t('statAtkSpeed'),    value: `×${State.stats.attackSpeedMultiplier.toFixed(2)}`,                            color:'#ffdd44' },
              { label: t('statProjectiles'), value: `${1+State.stats.projectileCountBonus}`,                                       color:'#88aaff' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center font-mono px-5 py-1"
                style={{ borderTop:'1px solid rgba(255,255,255,0.05)', fontSize:'0.8rem' }}>
                <span style={{ color:'#aaa' }}>{label}</span>
                <span style={{ color, fontWeight:700 }}>{value}</span>
              </div>
            ))}
            <div className="flex flex-wrap gap-2 px-4 py-3" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
              <span className="font-mono" style={{ fontSize:'0.68rem', color:'#555', width:'100%' }}>{t('statWeapons')}:</span>
              {State.unlockedWeapons.includes(1) && <Badge color="#4488ff" border="#2244aa">🔵 {t('weaponBolt')}</Badge>}
              {State.unlockedWeapons.includes(2) && <Badge color="#66ccff" border="#2299aa">{t('effectSlimeSpray')}</Badge>}
              {State.unlockedWeapons.includes(3) && <Badge color="#88cc88" border="#448844">{t('effectStickyWeb')}</Badge>}
              {State.unlockedWeapons.includes(4) && <Badge color="#ff7744" border="#aa3322">{t('effectFireTrail')}</Badge>}
              {State.unlockedWeapons.includes(5) && <Badge color="#77ff66" border="#229944">{t('effectPoisonTrail')}</Badge>}
              {State.unlockedWeapons.includes(6) && <Badge color="#72d9ff" border="#2277aa">{t('effectIceTrail')}</Badge>}
              {State.player.lakeBuffTimer > 0 && <Badge color="#aaddff" border="#336688">{t('effectLakeBuff')} {Math.ceil(State.player.lakeBuffTimer)}s</Badge>}
              {State.miniClones.length > 0 && <Badge color="#aaffcc" border="#44aa66">⚡ {t('miniClone')} ×{State.miniClones.length}</Badge>}
            </div>
            {State.collectedArtifactIds.length > 0 && (
              <div className="flex flex-wrap gap-2 px-4 py-3" style={{ borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                <span className="font-mono" style={{ fontSize:'0.68rem', color:'#555', width:'100%' }}>{t('artifact')}:</span>
                {State.collectedArtifactIds.map(id => (
                  <Badge key={id} color="#ffcc44" border="#886600">
                    {t(artLabelKey(id))}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3 w-full px-6" style={{ maxWidth:300 }}>
            <button onClick={onResume} className="font-mono font-black tracking-widest text-white transition-all active:scale-95" style={BtnPrimary}>
              ▶ {t('resume')}
            </button>
            <button onClick={onGoMenu} className="font-mono font-bold tracking-widest transition-all active:scale-95" style={BtnSecondary}>
              {t('mainMenu')}
            </button>
            <button onClick={() => setPauseSettingsOpen(true)}
              className="font-mono font-bold tracking-widest transition-all active:scale-95"
              style={{ ...BtnSecondary, padding:'11px 0' }}>
              ⚙ {t('settings')}
            </button>
          </div>

          {pauseSettingsOpen && (
            <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-y-auto"
              style={{ background:'rgba(5,15,40,0.98)', backdropFilter:'blur(6px)' }}>
              <h2 className="font-mono font-black tracking-widest mb-6"
                style={{ fontSize:'clamp(1.4rem,6vw,2.1rem)', color:'#7ec8ff', textShadow:'0 3px 0 #0d3b6e' }}>
                ⚙ {t('settings')}
              </h2>
              <div className="flex flex-col gap-6 w-full px-8 rounded-2xl py-8"
                style={{ maxWidth:340, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(100,160,255,0.2)' }}>
                <div className="flex flex-col items-center gap-3">
                  <p className="font-mono font-bold tracking-widest" style={{ color:'#a8d4ff', fontSize:'0.9rem' }}>
                    {t('language')}
                  </p>
                  <div className="flex gap-3">
                    {(['ru','en'] as Lang[]).map(l => (
                      <button key={l} onClick={() => changeLang(l)}
                        className="font-mono font-black tracking-widest transition-all active:scale-95"
                        style={{ width:90, padding:'12px 0', borderRadius:12, fontSize:'1rem',
                          background: lang===l ? 'linear-gradient(180deg,#2f80ed 0%,#1a55c0 100%)' : 'rgba(255,255,255,0.08)',
                          border: lang===l ? '3px solid #0f3a9a' : '2px solid rgba(100,160,255,0.25)',
                          color: lang===l ? '#fff' : '#7ec8ff',
                          boxShadow: lang===l ? '0 4px 0 #0a2a6e' : '0 2px 0 rgba(0,0,0,0.3)' }}>
                        {l==='ru' ? '🇷🇺 RU' : '🇬🇧 EN'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-3">
                  <p className="font-mono font-bold tracking-widest" style={{ color:'#a8d4ff', fontSize:'0.9rem' }}>
                    {t('musicVol')}
                  </p>
                  <div className="flex items-center gap-4">
                    <button onClick={() => setMusicVol(v => Math.max(0, parseFloat((v - 0.1).toFixed(1))))}
                      className="font-mono font-black transition-all active:scale-90" style={VolumeButton} aria-label={t('volDown')}>−</button>
                    <span className="font-mono font-black text-center" style={{ minWidth:58, color:'#fff', fontSize:'1.15rem' }}>
                      {Math.round(musicVol * 100)}%
                    </span>
                    <button onClick={() => setMusicVol(v => Math.min(1, parseFloat((v + 0.1).toFixed(1))))}
                      className="font-mono font-black transition-all active:scale-90" style={VolumeButton} aria-label={t('volUp')}>+</button>
                  </div>
                  <div style={{ width:'100%', height:7, borderRadius:4, background:'rgba(255,255,255,0.1)', overflow:'hidden' }}>
                    <div style={{ width:`${musicVol*100}%`, height:'100%', borderRadius:4, background:'linear-gradient(90deg,#2f80ed,#7ec8ff)', transition:'width 0.15s' }} />
                  </div>
                </div>
              </div>
              <button onClick={() => setPauseSettingsOpen(false)}
                className="mt-8 font-mono font-bold tracking-widest transition-all active:scale-95"
                style={{ ...BtnSecondary, padding:'13px 40px' }}>
                ← {t('back')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── LEVEL UP overlay ── */}
      {gameStatus === 'LEVEL_UP' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 select-none overflow-y-auto"
          style={{ paddingTop: 18, paddingBottom: 18 }}>
          {removalStep === 'idle' && (
            <>
              <h2 className="font-mono font-black text-center mb-5"
                style={{ fontSize:'clamp(1.8rem,8vw,3rem)', color:'#ffd700', textShadow:'0 4px 0 #996600', letterSpacing:'0.08em', whiteSpace:'pre-line' }}>
                {t('levelUp')}
              </h2>
              <UpgradeButtons upgrades={upgrades} onPick={onUpgrade} onInfo={showInfo} />
              <button
                type="button"
                onClick={onStartRemoval}
                disabled={!canUseRemovalAction()}
                className="mt-3 flex items-center justify-center gap-3 font-mono font-black text-white transition-all active:scale-95"
                style={{
                  width: 'calc(100% - 32px)',
                  maxWidth: 380,
                  minHeight: 72,
                  padding: '8px 18px',
                  borderRadius: 18,
                  background: canUseRemovalAction()
                    ? 'linear-gradient(180deg,rgba(255,92,92,0.95),rgba(178,26,42,0.95))'
                    : 'linear-gradient(180deg,rgba(110,110,120,0.75),rgba(54,54,64,0.75))',
                  border: `3px solid ${canUseRemovalAction() ? '#ff4242' : '#777784'}`,
                  boxShadow: `0 5px 0 ${canUseRemovalAction() ? '#8c1420' : '#33333d'}`,
                  opacity: State.removalActionUsed ? 0.62 : 1,
                }}
              >
                <img src={assetUrl('/ui/remove-ability.png')} alt="" draggable={false}
                  style={{
                    width: 48,
                    height: 48,
                    imageRendering: 'pixelated',
                    filter: canUseRemovalAction() ? 'none' : 'grayscale(1) brightness(0.72)',
                  }} />
                <span style={{ fontSize: 'clamp(0.8rem,4vw,1.05rem)', letterSpacing: '0.08em' }}>
                  {State.removalActionUsed ? t('removeAbilityUsed') :
                    canUseRemovalAction() ? t('removeAbility') : t('removeAbilityNeedTwo')}
                </span>
              </button>
            </>
          )}

          {removalStep === 'remove' && (
            <>
              <h2 className="font-mono font-black text-center mb-3"
                style={{ fontSize:'clamp(1.5rem,7vw,2.4rem)', color:'#ff7777', textShadow:'0 4px 0 #8c1420', letterSpacing:'0.08em' }}>
                {t('removeAbilityTitle')}
              </h2>
              <p className="font-mono text-center px-6 mb-4"
                style={{ color:'#ffe0e0', fontSize:'clamp(0.78rem,3.5vw,0.98rem)' }}>
                {t('removeAbilityDescription')}
              </p>
              <AbilityTargetList abilities={getRunAbilityTargets()} mode="remove" onPick={onRemoveAbility} />
              <button type="button" onClick={() => setRemovalStep('idle')}
                className="mt-4 font-mono font-black text-white"
                style={{ ...BtnSecondary, width: 180 }}>
                {t('removeAbilityCancel')}
              </button>
            </>
          )}

          {removalStep === 'boost' && (
            <>
              <h2 className="font-mono font-black text-center mb-3"
                style={{ fontSize:'clamp(1.4rem,6vw,2.2rem)', color:'#ffd15a', textShadow:'0 4px 0 #8c6414', letterSpacing:'0.04em' }}>
                {t('removeAbilityTitle')}
              </h2>
              <p className="font-mono text-center px-6 mb-4"
                style={{ color:'#fff1b0', fontSize:'clamp(0.78rem,3.5vw,0.98rem)' }}>
                {t('chooseAbilityToBoost')}
              </p>
              <AbilityTargetList abilities={getRunAbilityTargets()} mode="boost" onPick={onBoostAbility} />
            </>
          )}
        </div>
      )}

      {/* ── CHEST overlay — artifact ── */}
      {gameStatus === 'CHEST' && State.chestReward?.type === 'artifact' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 select-none">
           <img src={assetUrl(State.currentChestKind === 'special' ? '/sprites/chest_special.png' : '/sprites/chest.png')} alt="" draggable={false}
            style={{ width:64, height:64, imageRendering:'pixelated', objectFit:'contain' }} />
          <h2 className="font-mono font-black text-center mb-2 mt-2"
            style={{ fontSize:'clamp(1.4rem,6vw,2.2rem)', color:'#ffd700', textShadow:'0 3px 0 #886600' }}>
             {t('artifactFound')}{State.chestRewardsRemaining > 1 ? ` ×${State.chestRewardsRemaining}` : ''}
          </h2>
          <div className="font-mono font-black text-center px-8 py-6 rounded-2xl mb-6"
            style={{ background:'linear-gradient(135deg,#2a1a4a,#1a0e3a)', border:'2px solid #8844ff',
              boxShadow:'0 0 30px rgba(150,80,255,0.4)', maxWidth:300, width:'90%' }}>
            <div style={{ fontSize:'2rem', marginBottom:8 }}>✨</div>
            <div className="relative" style={{ color:'#ffcc88', fontSize:'clamp(1rem,4vw,1.2rem)', fontWeight:900, paddingRight:34 }}>
              {t(artLabelKey(State.chestReward.artifact.id))}
              <InfoButton
                label={`${t(artLabelKey(State.chestReward.artifact.id))} — ${t('info')}`}
                onClick={() => showInfo(
                  t(artLabelKey(State.chestReward!.artifact.id)),
                  t(artDescKey(State.chestReward!.artifact.id)),
                )}
              />
            </div>
          </div>
          <button onClick={onClaimArtifact}
            className="font-mono font-black tracking-widest text-white transition-all active:scale-95"
            style={{ ...BtnPrimary, padding:'14px 48px', background:'linear-gradient(180deg,#9944ff,#5511aa)',
              border:'3px solid #6622bb', boxShadow:'0 4px 0 #33008a' }}>
            ✦ CLAIM
          </button>
        </div>
      )}

      {/* ── CHEST overlay — upgrade choices ── */}
      {gameStatus === 'CHEST' && !State.chestReward && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 select-none">
           <img src={assetUrl(State.currentChestKind === 'special' ? '/sprites/chest_special.png' : '/sprites/chest.png')} alt="" draggable={false}
            style={{ width:64, height:64, imageRendering:'pixelated', objectFit:'contain' }} />
          <h2 className="font-mono font-black text-center mb-6 mt-2"
            style={{ fontSize:'clamp(1.4rem,6vw,2.2rem)', color:'#ffd700', textShadow:'0 3px 0 #886600' }}>
            {t('chest')}{State.chestRewardsRemaining > 1 ? ` ×${State.chestRewardsRemaining}` : ''}
          </h2>
          <UpgradeButtons upgrades={upgrades} onPick={onUpgrade} onInfo={showInfo} />
        </div>
      )}

      {/* ── WIN overlay ── */}
      {gameStatus === 'WIN' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none overflow-y-auto"
          style={{ background:'linear-gradient(180deg,rgba(0,0,0,0.88),rgba(0,40,0,0.94))' }}>
          <div style={{ fontSize:'4rem', marginBottom:8 }}>🏆</div>
          <h2 className="font-mono font-black text-center mb-2"
            style={{ fontSize:'clamp(2rem,10vw,4rem)', color:'#ffd700',
              textShadow:'0 5px 0 #886600', letterSpacing:'0.1em', lineHeight:1.1, whiteSpace:'pre-line' }}>
            {t('youWin')}
          </h2>
          <p className="font-mono text-center mb-5 px-6"
            style={{ color:'#88ffaa', fontSize:'clamp(0.8rem,3.5vw,1rem)' }}>
            {t('youWinSub')}
          </p>
          <div className="flex flex-col gap-2 mb-6 px-8 py-5 rounded-2xl text-center font-mono"
            style={{ background:'rgba(0,60,0,0.5)', border:'2px solid rgba(100,255,100,0.3)', minWidth:260 }}>
            <StatLine label={t('survived')}        value={fmtTime(gameStats.time)} color="#ffd700" />
            <StatLine label={t('enemiesDefeated')} value={String(gameStats.kills)} color="#fff" />
            <StatLine label={t('levelReached')}    value={String(gameStats.level)} color="#fff" />
          </div>
          <div className="flex flex-col gap-3 w-full px-8" style={{ maxWidth:300 }}>
            <button onClick={onPlayAgain} className="font-mono font-black tracking-widest text-white transition-all active:scale-95"
              style={{ padding:'15px 0', borderRadius:14, fontSize:'clamp(0.9rem,4vw,1.2rem)',
                background:'linear-gradient(180deg,#22aa44,#116622)', border:'3px solid #0a4418', boxShadow:'0 5px 0 #083310' }}>
              {t('playAgain')}
            </button>
            <button onClick={onGoMenu} className="font-mono font-bold tracking-widest transition-all active:scale-95" style={BtnSecondary}>
              {t('mainMenu')}
            </button>
          </div>
        </div>
      )}

      {/* ── GAME OVER overlay ── */}
      {gameStatus === 'GAME_OVER' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center select-none"
          style={{ background:'linear-gradient(180deg,rgba(0,0,0,0.85),rgba(60,0,0,0.9))' }}>
          <h2 className="font-mono font-black text-center mb-5"
            style={{ fontSize:'clamp(2rem,10vw,4rem)', color:'#ff4444', textShadow:'0 5px 0 #660000',
              letterSpacing:'0.1em', lineHeight:1.1 }}>
            {t('gameOver')}
          </h2>
          <div className="flex flex-col gap-2 mb-6 px-8 py-5 rounded-2xl text-center font-mono"
            style={{ background:'rgba(0,0,0,0.4)', border:'2px solid rgba(255,80,80,0.3)', minWidth:260 }}>
            <StatLine label={t('survived')}        value={fmtTime(gameStats.time)} color="#fff" />
            <StatLine label={t('enemiesDefeated')} value={String(gameStats.kills)} color="#fff" />
            <StatLine label={t('levelReached')}    value={String(gameStats.level)} color="#ffd700" />
          </div>
          <div className="flex flex-col gap-3 w-full px-8" style={{ maxWidth:300 }}>
            <button onClick={onPlayAgain} className="font-mono font-black tracking-widest text-white transition-all active:scale-95"
              style={{ padding:'15px 0', borderRadius:14, fontSize:'clamp(0.9rem,4vw,1.2rem)',
                background:'linear-gradient(180deg,#cc2222,#881111)', border:'3px solid #550000', boxShadow:'0 5px 0 #330000' }}>
              {t('playAgain')}
            </button>
            <button onClick={onGoMenu} className="font-mono font-bold tracking-widest transition-all active:scale-95" style={BtnSecondary}>
              {t('mainMenu')}
            </button>
          </div>
        </div>
       )}
       <InfoModal info={info} onClose={() => setInfo(null)} />
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────────
type LangKey = Parameters<typeof t>[0];
function artLabelKey(id: string): LangKey {
  const map: Record<string,LangKey> = {
    magnet:'artMagnet', thorns:'artThorns', regen:'artRegen',
    berserker:'artBerserker', iron_skin:'artIronSkin', swift:'artSwift',
  };
  return map[id] ?? 'artMagnet';
}
function artDescKey(id: string): LangKey {
  const map: Record<string,LangKey> = {
    magnet:'artMagnetDesc', thorns:'artThornsDesc', regen:'artRegenDesc',
    berserker:'artBerserkerDesc', iron_skin:'artIronSkinDesc', swift:'artSwiftDesc',
  };
  return map[id] ?? 'artMagnetDesc';
}

function upgradeDescKey(id: string): LangKey {
  const map: Record<string, LangKey> = {
    dmg: 'upgDmgDesc',
    atk_spd: 'upgAtkSpdDesc',
    move_spd: 'upgMoveSpdDesc',
    hp: 'upgHpDesc',
    proj: 'upgProjDesc',
    w2: 'upgSlimeSprayDesc',
    w3: 'upgStickyWebDesc',
    weapon_1: 'upgSlimeBoltDesc',
    weapon_2: 'upgSlimeSprayDesc',
    weapon_3: 'upgStickyWebDesc',
    weapon_4: 'upgFireTrailDesc',
    weapon_5: 'upgPoisonTrailDesc',
    weapon_6: 'upgIceTrailDesc',
    shrink: 'upgShrinkDesc',
    split: 'upgSplitDesc',
    heal: 'upgHealDesc',
  };
  return map[id] ?? 'upgDmgDesc';
}

function Badge({ children, color, border }: { children: React.ReactNode; color: string; border: string }) {
  return (
    <span className="font-mono px-2 py-1 rounded-lg"
      style={{ fontSize:'0.7rem', color, background:`${color}18`, border:`1px solid ${border}` }}>
      {children}
    </span>
  );
}

function StatLine({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ color:'#aaa', fontSize:'clamp(0.85rem,3.5vw,1rem)' }}>
      {label}: <span style={{ color, fontWeight:900 }}>{value}</span>
    </div>
  );
}

function AbilityTargetList({
  abilities,
  mode,
  onPick,
}: {
  abilities: AbilityTarget[];
  mode: 'remove' | 'boost';
  onPick: (ability: AbilityTarget) => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-full px-4" style={{ maxWidth: 380 }}>
      {abilities.map((ability) => {
        const color = CARD_COLORS[ability.kind];
        return (
          <button
            key={ability.id}
            type="button"
            onClick={() => onPick(ability)}
            className="flex items-center justify-between gap-3 text-left font-mono font-black text-white transition-all active:scale-95"
            style={{
              minHeight: 64,
              padding: '10px 15px',
              borderRadius: 15,
              background: 'linear-gradient(135deg,#293b70,#17244b)',
              border: `3px solid ${mode === 'remove' ? '#ff5b68' : color}`,
              boxShadow: `0 4px 0 ${mode === 'remove' ? '#8c1420' : `${color}66`}`,
            }}
          >
            <span style={{ fontSize: 'clamp(0.78rem,3.5vw,1rem)', whiteSpace: 'pre-line', lineHeight: 1.1 }}>
              {ability.label}
            </span>
            <span style={{ color: mode === 'remove' ? '#ff9ba3' : '#fff1a8', fontSize: '0.72rem', textAlign: 'right', whiteSpace: 'nowrap' }}>
              {mode === 'remove'
                ? '✕'
                : `${t('removeAbilityLevelBonus')}`}
              <br />
              <span style={{ color: '#d6e3ff' }}>
                {t('upgradeLevel')} {ability.level} / {ability.maxLevel}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function UpgradeButtons({
  upgrades,
  onPick,
  onInfo,
}: {
  upgrades: UpgradeOptions[];
  onPick: (u: UpgradeOptions) => void;
  onInfo: (title: string, description: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 w-full px-4" style={{ maxWidth:380 }}>
      {upgrades.map((u, i) => (
        <div key={`${u.id}-${u.level}-${i}`} className="relative" style={{ minHeight:124 }}>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundColor: CARD_COLORS[u.kind],
              maskImage: `url(${assetUrl('/ui/upgrade-card.png')})`,
              WebkitMaskImage: `url(${assetUrl('/ui/upgrade-card.png')})`,
              maskSize: '100% 100%',
              WebkitMaskSize: '100% 100%',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              opacity: 0.95,
              zIndex: 1,
            }}
          />
          <button onClick={() => onPick(u)}
            className="w-full font-mono font-bold text-white transition-all active:scale-95"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 0,
              padding:'13px 62px 31px 22px',
              borderRadius:22,
              fontSize:'clamp(0.78rem,3.2vw,0.98rem)',
              background: u.kind === 'weapon'
                ? 'linear-gradient(135deg,#273d74,#172752)'
                : u.kind === 'mini'
                  ? 'linear-gradient(135deg,#594728,#2d2417)'
                  : 'linear-gradient(135deg,#293b70,#17244b)',
              border: `3px solid ${CARD_COLORS[u.kind]}`,
              boxShadow:`0 5px 0 ${CARD_COLORS[u.kind]}66`,
              textAlign:'left',
              whiteSpace:'pre-line',
            }}>
            <span style={{ display:'block', lineHeight:1.1 }}>{u.label}</span>
            <span style={{ display:'block', marginTop:7, color:'#fff1a8', fontSize:'0.72em', letterSpacing:'0.08em' }}>
              {t('upgradeLevel')} {u.level}{u.level === u.maxLevel ? ` · ${t('upgradeMax')}` : ''}
            </span>
          </button>
          <div
            className="pointer-events-none absolute bottom-3 right-4 flex items-center gap-0.5"
            style={{ zIndex: 2 }}
            aria-label={`${t('upgradeLevel')} ${u.level} / ${u.maxLevel}`}
          >
            {Array.from({ length: u.maxLevel }, (_, level) => (
              <img
                key={level}
                src={assetUrl(`/ui/upgrade-level-${level < u.level ? 'filled' : 'empty'}.png`)}
                alt=""
                draggable={false}
                style={{
                  width: 15, height: 15, imageRendering:'pixelated',
                  filter: CARD_IMAGE_FILTERS[u.kind],
                }}
              />
            ))}
          </div>
          <InfoButton
            label={`${u.label.replace(/\n/g, ' ')} — ${t('info')}`}
            tint={u.kind}
            onClick={() => onInfo(
              `${u.label.replace(/\n/g, ' ')} ${t('upgradeLevel')} ${u.level}`,
              `${t(upgradeDescKey(u.id))}\n${t('upgradeLevel')} ${u.level} / ${u.maxLevel}`,
            )}
          />
        </div>
      ))}
    </div>
  );
}
