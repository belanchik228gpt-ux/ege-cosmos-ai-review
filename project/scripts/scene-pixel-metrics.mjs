import { createRequire } from 'node:module';
import path from 'node:path';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
let PNG;
try {
  ({ PNG } = require('pngjs'));
} catch {
  ({ PNG } = require(
    path.join(
      process.env.USERPROFILE,
      '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pngjs',
    ),
  ));
}

/** Pixel evidence; a compositor tolerance never gets labelled exact equality. */
export function compareScenePixels(before, after) {
  const a = PNG.sync.read(before),
    b = PNG.sync.read(after);
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  let changedPixels = 0,
    maxChannelDelta = 0;
  for (let index = 0; index < a.data.length; index += 4) {
    let changed = false;
    for (let channel = 0; channel < 4; channel++) {
      const delta = Math.abs(a.data[index + channel] - b.data[index + channel]);
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      if (delta) changed = true;
    }
    if (changed) changedPixels++;
  }
  return {
    exactFileEquality: before.equals(after),
    exactPixelEquality: changedPixels === 0,
    maxChannelDelta,
    changedPixels,
    totalPixels: a.width * a.height,
    changedFraction: changedPixels / (a.width * a.height),
  };
}

// Passed to a Playwright locator.evaluate; intentionally independent of module globals.
export function readSceneVisualState(body) {
  return {
    geometry: [...body.querySelectorAll('svg *')].map((node) => {
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        attributes: [...node.attributes].map((a) => [a.name, a.value]),
        opacity: style.opacity,
        transform: style.transform,
        strokeDashoffset: style.strokeDashoffset,
        fill: style.fill,
        stroke: style.stroke,
        filter: style.filter,
        cx: style.cx,
        cy: style.cy,
      };
    }),
    animations: body.getAnimations({ subtree: true }).map((animation) => ({
      currentTime: animation.currentTime,
      playState: animation.playState,
      transitionProperty: animation.transitionProperty,
      animationName: animation.animationName,
      target: animation.effect?.target?.tagName,
    })),
  };
}
