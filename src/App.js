import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

const ROWS = 20;
const COLS = 20;
const CELL_SIZE = 24;
const INITIAL_SPEED = 150;

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

export default function App() {
  const [state, setState] = useState(getInitialState());

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

      if (newHead.x < 0 || newHead.x >= COLS || newHead.y < 0 || newHead.y >= ROWS) {
        return { ...prev, dead: true, running: false };
      }

      if (prev.snake.some(s => s.x === newHead.x && s.y === newHead.y)) {
        return { ...prev, dead: true, running: false };
      }

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

  useEffect(() => {
    if (!state.running) return;
    const speed = Math.max(60, INITIAL_SPEED - Math.floor(state.score / 50) * 10);
    const id = setInterval(tick, speed);
    return () => clearInterval(id);
  }, [state.running, state.score, tick]);

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

      <div className="board" style={{ width: COLS * CELL_SIZE, height: ROWS * CELL_SIZE }}>
        {state.snake.map((seg, i) => (
          <div
            key={i}
            className={`cell snake${i === 0 ? ' head' : ''}`}
            style={{ left: seg.x * CELL_SIZE, top: seg.y * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE }}
          />
        ))}
        <div
          className="cell food"
          style={{ left: state.food.x * CELL_SIZE, top: state.food.y * CELL_SIZE, width: CELL_SIZE, height: CELL_SIZE }}
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
      <p className="hint">方向键 或 WASD 控制方向</p>
    </div>
  );
}
