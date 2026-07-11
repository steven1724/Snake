import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

const ROWS = 30;
const COLS = 30;
const INITIAL_SPEED = 150;
const CHROME_HEIGHT = 220; // 给标题/分数/按钮/提示预留的高度
const BOARD_MARGIN = 32;

// 根据当前窗口大小反算单元格边长，保证 30x30 的地图整屏可见、无需滚动
function computeCellSize() {
  const availWidth = window.innerWidth - BOARD_MARGIN;
  const availHeight = window.innerHeight - CHROME_HEIGHT;
  const size = Math.floor(Math.min(availWidth, availHeight) / COLS);
  return Math.max(8, size);
}

const Direction = { UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT' };

const getInitialState = () => ({
  snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
  food: { x: 15, y: 10 },
  dir: Direction.RIGHT,
  nextDir: Direction.RIGHT,
  running: false,
  dead: false,
  score: 0,
});

function randomFood(snake) {
  let pos;
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some(s => s.x === pos.x && s.y === pos.y));
  return pos;
}

const NOTE_FREQ = {
  C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0,
  A4: 440.0, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25,
  G3: 196.0, A3: 220.0,
};

// 8-bit 风格的循环旋律，[音符, 时长(秒)]
const MELODY = [
  ['E4', 0.2], ['G4', 0.2], ['A4', 0.2], ['G4', 0.2],
  ['E4', 0.2], ['D4', 0.2], ['E4', 0.4],
  ['D4', 0.2], ['C4', 0.2], ['D4', 0.2], ['E4', 0.2],
  ['C4', 0.4], ['G3', 0.4],
];

// 所有音效/音乐共用同一个 AudioContext，避免反复创建
let sharedAudioCtx = null;
function getAudioContext() {
  if (!sharedAudioCtx) {
    sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return sharedAudioCtx;
}

// 用 Web Audio API 的振荡器循环播放旋律，无需任何音频文件
function useBackgroundMusic(playing) {
  useEffect(() => {
    if (!playing) return;

    const ctx = getAudioContext();
    let cancelled = false;
    let timeoutId;

    const playLoop = () => {
      if (cancelled) return;
      let t = ctx.currentTime;
      MELODY.forEach(([note, dur]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = NOTE_FREQ[note];
        gain.gain.setValueAtTime(0.06, t);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.9);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur);
        t += dur;
      });
      const totalDuration = MELODY.reduce((sum, [, dur]) => sum + dur, 0);
      timeoutId = setTimeout(playLoop, totalDuration * 1000);
    };

    playLoop();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [playing]);
}

// 吃到食物时的短促上扬音效
function playEatSound() {
  const ctx = getAudioContext();
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(440, t);
  osc.frequency.exponentialRampToValueAtTime(880, t + 0.1);
  gain.gain.setValueAtTime(0.08, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

// 撞墙/撞到自己导致游戏结束时的音效：经典"伤感小号"四连音下行，每个音带一点下滑
function playGameOverSound() {
  const ctx = getAudioContext();
  let t = ctx.currentTime;
  const notes = [415.3, 392.0, 369.99, 349.23]; // G#4 -> G4 -> F#4 -> F4，半音下行
  const durations = [0.18, 0.18, 0.18, 0.55]; // 最后一个音拖长，表示"遗憾地拖了个尾音"

  notes.forEach((freq, i) => {
    const dur = durations[i];
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq * 1.06, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.4);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.95);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur);
    t += dur;
  });
}

export default function App() {
  const [state, setState] = useState(getInitialState());
  const [cellSize, setCellSize] = useState(computeCellSize);
  const boardRef = useRef(null);

  // 游戏进行中（running）才播放背景音乐，暂停/结束自动停止
  useBackgroundMusic(state.running);

  // 分数增加（即吃到食物）时播放音效
  const prevScoreRef = useRef(state.score);
  useEffect(() => {
    if (state.score > prevScoreRef.current) {
      playEatSound();
    }
    prevScoreRef.current = state.score;
  }, [state.score]);

  // dead 由 false 变为 true（撞墙/撞到自己）时播放游戏结束音效
  const prevDeadRef = useRef(state.dead);
  useEffect(() => {
    if (state.dead && !prevDeadRef.current) {
      playGameOverSound();
    }
    prevDeadRef.current = state.dead;
  }, [state.dead]);

  // 窗口尺寸变化时（比如旋转屏幕）重新计算单元格大小
  useEffect(() => {
    const onResize = () => setCellSize(computeCellSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 游戏主循环：每个 tick 让蛇朝当前方向前进一格
  const tick = useCallback(() => {
    setState(prev => {
      if (!prev.running || prev.dead) return prev;

      const dir = prev.nextDir;
      const head = prev.snake[0];
      const delta = {
        UP: { x: 0, y: -1 },
        DOWN: { x: 0, y: 1 },
        LEFT: { x: -1, y: 0 },
        RIGHT: { x: 1, y: 0 },
      }[dir];

      const newHead = { x: head.x + delta.x, y: head.y + delta.y };

      // 撞墙判定
      if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
        return { ...prev, dead: true, running: false };
      }

      // 撞到自己身体判定
      if (prev.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
        return { ...prev, dead: true, running: false };
      }

      // 吃到食物则蛇身变长（不删尾巴），否则正常前进
      const ateFood = newHead.x === prev.food.x && newHead.y === prev.food.y;
      const newSnake = [newHead, ...prev.snake];
      if (!ateFood) newSnake.pop();

      return {
        ...prev,
        dir,
        snake: newSnake,
        food: ateFood ? randomFood(newSnake) : prev.food,
        score: ateFood ? prev.score + 10 : prev.score,
      };
    });
  }, []);

  // 分数越高蛇移动越快（每 50 分提速 10ms，下限 60ms）
  useEffect(() => {
    if (!state.running) return;
    const speed = Math.max(60, INITIAL_SPEED - Math.floor(state.score / 50) * 10);
    const id = setInterval(tick, speed);
    return () => clearInterval(id);
  }, [state.running, state.score, tick]);

  // 手机端滑动控制：记录触摸起点，抬手时按位移较大的轴判断滑动方向
  useEffect(() => {
    let touchStart = null;

    const onTouchStart = (e) => {
      const t = e.touches[0];
      touchStart = { x: t.clientX, y: t.clientY };
    };

    const onTouchEnd = (e) => {
      if (!touchStart) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.x;
      const dy = t.clientY - touchStart.y;
      touchStart = null;

      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;

      const opposite = {
        UP: Direction.DOWN, DOWN: Direction.UP,
        LEFT: Direction.RIGHT, RIGHT: Direction.LEFT,
      };

      let newDir;
      if (Math.abs(dx) > Math.abs(dy)) {
        newDir = dx > 0 ? Direction.RIGHT : Direction.LEFT;
      } else {
        newDir = dy > 0 ? Direction.DOWN : Direction.UP;
      }

      setState(prev => {
        if (opposite[newDir] === prev.dir) return prev;
        return { ...prev, nextDir: newDir };
      });
    };

    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // 键盘控制：方向键 / WASD
  useEffect(() => {
    const onKey = (e) => {
      const map = {
        ArrowUp: Direction.UP, w: Direction.UP, W: Direction.UP,
        ArrowDown: Direction.DOWN, s: Direction.DOWN, S: Direction.DOWN,
        ArrowLeft: Direction.LEFT, a: Direction.LEFT, A: Direction.LEFT,
        ArrowRight: Direction.RIGHT, d: Direction.RIGHT, D: Direction.RIGHT,
      };
      const newDir = map[e.key];
      if (!newDir) return;

      const opposite = {
        UP: Direction.DOWN, DOWN: Direction.UP,
        LEFT: Direction.RIGHT, RIGHT: Direction.LEFT,
      };

      setState(prev => {
        if (opposite[newDir] === prev.dir) return prev;
        return { ...prev, nextDir: newDir };
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 鼠标控制：点击地图上蛇头的某一侧，蛇转向该方向（按偏移量较大的轴判断）
  const onBoardMouseDown = useCallback((e) => {
    const board = boardRef.current;
    if (!board) return;
    const rect = board.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    setState(prev => {
      const head = prev.snake[0];
      const headX = head.x * cellSize + cellSize / 2;
      const headY = head.y * cellSize + cellSize / 2;
      const dx = clickX - headX;
      const dy = clickY - headY;

      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return prev;

      const opposite = {
        UP: Direction.DOWN, DOWN: Direction.UP,
        LEFT: Direction.RIGHT, RIGHT: Direction.LEFT,
      };

      const newDir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? Direction.RIGHT : Direction.LEFT)
        : (dy > 0 ? Direction.DOWN : Direction.UP);

      if (opposite[newDir] === prev.dir) return prev;
      return { ...prev, nextDir: newDir };
    });
  }, [cellSize]);

  const start = () => {
    if (state.dead) {
      setState({ ...getInitialState(), running: true });
    } else {
      setState(prev => ({ ...prev, running: !prev.running }));
    }
  };

  return (
    <div className="app">
      <h1>贪吃蛇</h1>
      <div className="scoreboard">分数: {state.score}</div>

      <div
        className="board"
        ref={boardRef}
        onMouseDown={onBoardMouseDown}
        style={{ width: COLS * cellSize, height: ROWS * cellSize }}
      >
        {state.snake.map((seg, i) => (
          <div
            key={i}
            className={`cell snake${i === 0 ? ' head' : ''}`}
            style={{ left: seg.x * cellSize, top: seg.y * cellSize, width: cellSize, height: cellSize }}
          />
        ))}
        <div
          className="cell food"
          style={{ left: state.food.x * cellSize, top: state.food.y * cellSize, width: cellSize, height: cellSize }}
        />
        {(state.dead || (!state.running && !state.dead)) && (
          <div className="overlay">
            <div className="overlay-box">
              {state.dead ? (
                <>
                  <p>游戏结束</p>
                  <p>得分: {state.score}</p>
                </>
              ) : (
                <p>{state.score === 0 ? '按开始游戏' : '已暂停'}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="controls">
        <button onClick={start}>
          {state.dead ? '重新开始' : state.running ? '暂停' : '开始'}
        </button>
      </div>
      <p className="hint">方向键 / WASD 控制 · 手机滑动屏幕控制 · 鼠标点击地图控制方向</p>
    </div>
  );
}
