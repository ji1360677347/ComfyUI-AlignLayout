export function createScope() {
    const cleanups = [];
    const timers = new Set();
    const scope = {
        active: true,
        add(cleanup) {
            if (scope.active) cleanups.push(cleanup);
            else cleanup();
        },
        listen(target, type, listener, options) {
            target.addEventListener(type, listener, options);
            scope.add(() => target.removeEventListener(type, listener, options));
        },
        expose(name, value) {
            const existed = Object.hasOwn(window, name);
            const previous = window[name];
            window[name] = value;
            scope.add(() => {
                if (existed) window[name] = previous;
                else delete window[name];
            });
        },
        timeout(callback, delay) {
            if (!scope.active) return null;
            const id = setTimeout(() => {
                timers.delete(id);
                if (scope.active) callback();
            }, delay);
            timers.add(id);
            return id;
        },
        dispose() {
            if (!scope.active) return;
            scope.active = false;
            timers.forEach(clearTimeout);
            timers.clear();
            for (const cleanup of cleanups.reverse()) {
                try { cleanup(); }
                catch (error) { console.error("[AlignLayout] Cleanup failed", error); }
            }
            cleanups.length = 0;
        }
    };
    return scope;
}

export function createModeController(createDefault, createNodes2) {
    let activeScope = null;
    let activeMode = null;
    return {
        async switchMode(nodes2) {
            if (activeMode === nodes2 && activeScope?.active) return;
            activeScope?.dispose();
            const scope = createScope();
            activeScope = scope;
            activeMode = nodes2;
            try {
                const features = (nodes2 ? createNodes2 : createDefault)(scope);
                for (const feature of features) {
                    await feature.setup();
                    if (!scope.active) return;
                }
            } catch (error) {
                scope.dispose();
                if (activeScope === scope) {
                    activeScope = null;
                    activeMode = null;
                }
                throw error;
            }
        },
        dispose() {
            activeScope?.dispose();
            activeScope = null;
            activeMode = null;
        }
    };
}

export function isEditing(target) {
    return target instanceof Element && (
        target.closest("input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='textbox']") !== null
    );
}
