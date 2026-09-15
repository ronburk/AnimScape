/* message.js - define message loop.
 *
 * message = { name, command }
 *
 */

window.AnimScape.message = (() => {
    const queue         = [];
    const fsm_stack     = [];
    let   asleep;
    let   fsm       = (function* () { // the top-level Finite State Machine
        let message = yield;          // caller can't pass anything on first .next() call
        while(message !== undefined){
            message = yield message.command();
        }
    })();
    fsm.next();  // run up to first yield

    function send(message) {
        queue.push(message);
        if(asleep){
            asleep();             // wake up the message consumer
            asleep    = null;
        }
    }
    async function start() {
        while (true) {
            while (queue.length > 0) {
                const message = queue.shift();
                let   result  = fsm.next(message);
                // handle state changes
                while(result?.value?.fsm || result.done){
                    const next_fsm = result?.value?.fsm;
                    if(next_fsm){
                        fsm_stack.push(fsm);
                        fsm    = next_fsm;
                        result = fsm.next(message);
                    } else {
                        console.assert(fsm_stack.length !== 0);
                        fsm    = fsm_stack.pop();
                        result = fsm.next(message);
                    }
                }
            }
            await new Promise(resolve => asleep = resolve);
        }
    }

    return {start, send};
})();
