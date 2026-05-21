"use strict";

const assert = require("assert");
const GestureUi = require("../public/app-learning-growth-gesture-ui");

function createTarget(interactive = false) {
  const listeners = {};
  return {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
    dispatch(type, event) {
      listeners[type]?.(event);
    },
    startEvent(x, y) {
      return {
        target: interactive ? { closest: () => ({}) } : { closest: () => null },
        touches: [{ clientX: x, clientY: y }],
      };
    },
    endEvent(x, y) {
      return { changedTouches: [{ clientX: x, clientY: y }] };
    },
  };
}

function rootFor(target) {
  return { querySelector: () => target };
}

function testRightSwipeBackFromTaskDetail() {
  const target = createTarget(false);
  let called = 0;
  GestureUi.wireLearningGrowthBackSwipe(rootFor(target), () => { called += 1; });
  target.dispatch("touchstart", target.startEvent(120, 220));
  target.dispatch("touchend", target.endEvent(230, 235));
  assert.equal(called, 1);
}

function testIgnoresInteractiveControlsAndVerticalScroll() {
  const interactiveTarget = createTarget(true);
  let called = 0;
  GestureUi.wireLearningGrowthBackSwipe(rootFor(interactiveTarget), () => { called += 1; });
  interactiveTarget.dispatch("touchstart", interactiveTarget.startEvent(120, 220));
  interactiveTarget.dispatch("touchend", interactiveTarget.endEvent(260, 225));
  assert.equal(called, 0);

  const verticalTarget = createTarget(false);
  GestureUi.wireLearningGrowthBackSwipe(rootFor(verticalTarget), () => { called += 1; });
  verticalTarget.dispatch("touchstart", verticalTarget.startEvent(120, 220));
  verticalTarget.dispatch("touchend", verticalTarget.endEvent(230, 330));
  assert.equal(called, 0);
}

testRightSwipeBackFromTaskDetail();
testIgnoresInteractiveControlsAndVerticalScroll();

console.log("app learning growth gesture UI tests passed");
