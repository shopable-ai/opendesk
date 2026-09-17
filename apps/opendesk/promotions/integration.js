(function installOpenDeskPromotionsIntegration(root) {
  'use strict';

  function ownerOf(getOwner) {
    try { return typeof getOwner === 'function' ? getOwner() : null; } catch (_) { return null; }
  }

  async function noteOwner(getOwner, source) {
    const owner = ownerOf(getOwner);
    if (owner && typeof owner.noteOwnerInteraction === 'function') {
      await owner.noteOwnerInteraction(source);
    }
    return owner;
  }

  async function guardedAutomation(getOwner, source, task) {
    const owner = ownerOf(getOwner);
    let token = null;
    if (owner && typeof owner.beginAutomation === 'function') {
      token = await owner.beginAutomation(source);
    }
    try {
      return await task();
    } finally {
      const current = ownerOf(getOwner);
      if (current && typeof current.endAutomation === 'function') {
        await current.endAutomation(token);
      }
    }
  }

  function wrapFlowRunnerController(BaseController, getOwner) {
    if (!BaseController || typeof BaseController.createApp !== 'function') {
      throw new Error('Promotion Flow Runner guard requires a controller');
    }
    const wrapper = Object.assign({}, BaseController);
    wrapper.createApp = options => {
      const app = BaseController.createApp(options || {});
      async function requestRun(queue, source) {
        return guardedAutomation(getOwner, `flow-runner:${source || 'run'}`, () => app.requestRun(queue, source));
      }
      async function openList(...args) {
        const owner = await noteOwner(getOwner, 'flow-runner-manager');
        if (owner && typeof owner.beforeInteraction === 'function') {
          await owner.beforeInteraction('flow-runner-manager');
        }
        return app.openList(...args);
      }
      return Object.freeze(Object.assign({}, app, {requestRun, openList}));
    };
    return Object.freeze(wrapper);
  }

  function createPlayerUI(baseUI, getOwner) {
    if (!baseUI || typeof baseUI.createWindow !== 'function') {
      throw new Error('Promotion player guard requires ui.createWindow');
    }
    return Object.freeze({
      async createWindow(spec) {
        const handle = await baseUI.createWindow(spec);
        const isPlayerPanel = !!spec && typeof spec.id === 'string' && spec.id.startsWith('flowRunnerPanel');
        if (!isPlayerPanel || !handle) return handle;
        const decorated = {};
        for (const name of [
          'on','hide','close','focus','getState','waitUntilClosed','setBounds','setPosition',
          'setPlacement','setRelativeTo','setAlwaysOnTop','setDraggable','control',
        ]) {
          if (typeof handle[name] === 'function') decorated[name] = handle[name].bind(handle);
        }
        Object.defineProperty(decorated, 'id', {
          enumerable: true,
          configurable: false,
          get() { return handle.id; },
        });
        decorated.show = async function show() {
          const owner = await noteOwner(getOwner, 'flow-runner-panel');
          if (owner && typeof owner.beforeInteraction === 'function') {
            await owner.beforeInteraction('flow-runner-panel');
          }
          return handle.show();
        };
        return decorated;
      },
    });
  }

  function createFlowRunnerFloatingWindow(BaseFloatingWindow, getOwner) {
    if (typeof BaseFloatingWindow !== 'function') {
      throw new Error('Promotion Flow Runner surface guard requires FloatingWindow');
    }
    return function PromotionAwareFloatingWindow(spec) {
      const inner = new BaseFloatingWindow(spec);
      const wrapper = {};

      async function publish(state) {
        const owner = ownerOf(getOwner);
        if (!owner || typeof owner.setFlowRunnerSurface !== 'function') return;
        try { await owner.setFlowRunnerSurface(state); } catch (_) {}
      }

      for (const name of [
        'addSeparator','addSpacer','addLabel','addSwitch','addCheckbox','addInput','addSelect',
        'addSlider','addSegmentedControl','addProgress','removeButton','removeLabel','removeControl',
        'updateButton','updateLabel','updateControl','getButtonState','getLabelState','getControlState',
        'onButtonClick','onControlChange','onError','getState','setPosition','setPlacement','setAlwaysOnTop',
        'setDraggable','waitUntilClosed','run',
      ]) {
        if (typeof inner[name] === 'function') wrapper[name] = inner[name].bind(inner);
      }

      if (typeof inner.addButton === 'function') {
        wrapper.addButton = function addButton(id, label, icon, callback) {
          const guarded = typeof callback === 'function'
            ? async (...args) => {
              await noteOwner(getOwner, `flow-runner-button:${id}`);
              return callback(...args);
            }
            : callback;
          return inner.addButton(id, label, icon, guarded);
        };
      }

      wrapper.on = function on(type, callback) {
        if (typeof inner.on !== 'function') return undefined;
        if (type === 'move' || type === 'resize') {
          return inner.on(type, async event => {
            let state = null;
            try { state = typeof inner.getState === 'function' ? await inner.getState() : null; } catch (_) {}
            if (state) await publish(state);
            return typeof callback === 'function' ? callback(event) : undefined;
          });
        }
        if (type === 'close') {
          return inner.on(type, async event => {
            await publish(null);
            return typeof callback === 'function' ? callback(event) : undefined;
          });
        }
        return inner.on(type, callback);
      };

      wrapper.show = async function show() {
        const state = await inner.show();
        await publish(state);
        return state;
      };
      wrapper.hide = async function hide() {
        const state = await inner.hide();
        await publish(null);
        return state;
      };
      wrapper.close = async function close() {
        try { return await inner.close(); }
        finally { await publish(null); }
      };

      Object.defineProperty(wrapper, 'id', {
        enumerable: true,
        configurable: false,
        get() { return inner.id; },
      });
      return wrapper;
    };
  }

  function wrapAgent(agent, getOwner) {
    if (!agent || typeof agent.run !== 'function') return agent;
    const wrapped = {};
    if (typeof agent.getCapabilities === 'function') wrapped.getCapabilities = agent.getCapabilities.bind(agent);
    wrapped.run = async (...args) => guardedAutomation(getOwner, 'assistant:agent', () => agent.run(...args));
    return Object.freeze(wrapped);
  }

  function wrapCalculator(calculator, getOwner) {
    if (!calculator || typeof calculator.execute !== 'function') {
      throw new Error('Promotion calculator guard requires execute()');
    }
    return Object.freeze({
      definition: calculator.definition,
      async execute(...args) {
        return guardedAutomation(getOwner, 'assistant:calculator', () => calculator.execute(...args));
      },
    });
  }

  root.OpenDeskPromotionsIntegration = Object.freeze({
    wrapFlowRunnerController,
    createPlayerUI,
    createFlowRunnerFloatingWindow,
    wrapAgent,
    wrapCalculator,
  });
  if (typeof module === 'object' && module.exports) module.exports = root.OpenDeskPromotionsIntegration;
})(globalThis);
