window.AnimScape.message = (() => {
    const queue = [];
    const fsm_stack = [];
    let signal, fsm;

    function start(root_fsm) {
        fsm_stack.push(root_fsm);
        fsm = root_fsm;
        run_consumer();
    }

    function send(message) {
        queue.push(message);
        if (signal) {
            const wake_up = signal;
            signal = null;
            wake_up();
        }
    }

    async function run_consumer() {
        while (true) {
            while (queue.length > 0) {
                const message = queue.shift();
                fsm.do(message);
            }

            await new Promise(resolve => signal = resolve);
        }
    }

    return {start, send};
})();
