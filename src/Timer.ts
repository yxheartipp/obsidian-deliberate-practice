import { derived, writable, type Readable, type Writable, get } from 'svelte/store'
import { settings, plugin,goal, startTime} from 'stores'
// @ts-ignore
import Worker from 'clock.worker'
import { Notice, type TFile, moment } from 'obsidian'
import type DeliberatePracticePlugin from 'main'
// background worker
const clock: any = Worker()
clock.onmessage = ({ data }: any) => {
    store.tick(data as number)
}

let $plugin: DeliberatePracticePlugin

const pluginUnsubribe = plugin.subscribe((p) => ($plugin = p))


let running = false

interface TimerState {
    running: boolean
    lastTick: number
    mode: Mode
    elapsed: number
    startTime: number | null
    inSession: boolean
    workLen: number
    breakLen: number
    count: number
    duration: number
}

interface TimerControl {
    start: () => void
    tick: (t: number) => void
    endSession: (state: TimerState) => TimerState
    reset: () => void
    pause: () => void
    timeup: () => void
    toggleMode: (callback?: (state: TimerState) => void) => void
    toggleTimer: () => void
}

export type TimerStore = Writable<TimerState> & TimerControl

export type TimerRemained = {
    millis: number
    human: string
}

const state: Writable<TimerState> | TimerStore = writable({
    running: false,
    lastTick: 0,
    mode: 'WORK',
    elapsed: 0,
    startTime: null,
    inSession: false,
    workLen: 25,
    breakLen: 5,
    count: 25 * 60 * 1000,
    duration: 25,
})

const stateUnsubribe = state.subscribe((s) => (running = s.running))

const { update } = state

const settingsUnsubsribe = settings.subscribe(($settings) => {
    update((state) => {
        state.workLen = $settings.workLen
        state.breakLen = $settings.breakLen
        if (!state.running && !state.inSession) {
            state.duration =
                state.mode == 'WORK' ? state.workLen : state.breakLen
            state.count = state.duration * 60 * 1000
        }
        return state
    })
})

const methods: TimerControl = {
    toggleTimer() {
        running ? this.pause() : this.start()
    },
    start() {
        const currentGoal = get(goal)
        if (currentGoal == '' || currentGoal.trim() === '') {
            new Notice('deliberate practice must have a goal !!!');
            return;
        }
        update((s) => {
            let now = new Date().getTime()
            if (!s.inSession) {
                // new session
                s.elapsed = 0
                s.duration = s.mode === 'WORK' ? s.workLen : s.breakLen
                s.count = s.duration * 60 * 1000
                s.startTime = now
            }
            startTime.set(new Date(now));
            s.lastTick = now
            s.inSession = true
            s.running = true
            clock.postMessage(true)
            return s
        })
    },
    pause() {
        update((s) => {
            s.running = false
            clock.postMessage(false)
            return s
        })
    },
    async reset() {
        const state = get(store)
        if (state.inSession) {
            await promptForFeedback(state)
        }
        update((s) => {
            s.duration = s.mode == 'WORK' ? s.workLen : s.breakLen
            s.count = s.duration * 60 * 1000
            s.inSession = false
            s.running = false
            clock.postMessage(false)
            s.startTime = null
            s.elapsed = 0
            return s
        })
    },
    toggleMode(callback?: (state: TimerState) => void) {
        update((s) => {
            let updated = this.endSession(s)
            if (callback) {
                callback(updated)
            }
            return updated
        })
    },
    tick(t: number) {
        let timeup: boolean = false
        let pause: boolean = false
        update((s) => {
            if (s.running && s.lastTick) {
                let diff = t - s.lastTick
                s.lastTick = t
                s.elapsed += diff
                if (s.elapsed >= s.count) {
                    s.elapsed = s.count
                }
                timeup = s.elapsed >= s.count
            } else {
                pause = true
            }
            return s
        })
        if (!pause && timeup) {
            // const state = get(store)
            // promptForFeedback(state);
            this.timeup()
        }
    },
    timeup() {
        const state = get(store)
        update((s) => {
            promptForFeedback(state);
            return this.endSession(s)
        })
    },
    endSession(s: TimerState) {
        if (s.breakLen == 0) {
            s.mode = 'WORK'
        } else {
            s.mode = s.mode == 'WORK' ? 'BREAK' : 'WORK'
        }
        s.duration = s.mode == 'WORK' ? s.workLen : s.breakLen
        s.count = s.duration * 60 * 1000
        s.inSession = false
        s.running = false
        clock.postMessage(false)
        s.startTime = null
        s.elapsed = 0
        return s
    },
}

Object.keys(methods).forEach((key) => {
    let method = key as keyof TimerControl;
    (state as any)[method] = methods[method].bind(state)
})

async function promptForFeedback(state: TimerState) {
    if (state.mode == 'WORK') {
        const result = await getResult()
        const feedback = await promptForFeedbackText()
        const now = moment()
        const startDate = new Date();
        startTime.subscribe((value: Date) => {
            startDate.setTime(value.getTime());
        });
        const startTimeMoment = moment(startDate)
        const log = new PracticeLog(
            state.mode,
            get(goal),
            parseFloat(moment.duration(now.diff(startTimeMoment)).asMinutes().toFixed(1)),
            moment(startTimeMoment),
            now,
            result,
            feedback
        )

        await saveGoal(log)
        goal.set('')
    }
    
}

const getResult = async (): Promise<string> => {
    return new Promise((resolve) => {
        const inputContainer = document.createElement('div')
        inputContainer.style.position = 'fixed'
        inputContainer.style.top = '50%'
        inputContainer.style.left = '50%'
        inputContainer.style.transform = 'translate(-50%, -50%)'
        inputContainer.style.zIndex = '1000'
        inputContainer.style.background = 'white'
        inputContainer.style.padding = '20px'
        inputContainer.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)'
        inputContainer.style.borderRadius = '8px'

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Enter result';
        textarea.style.width = '100%';
        textarea.style.padding = '10px';
        textarea.style.marginBottom = '10px';
        textarea.style.boxSizing = 'border-box';
        textarea.style.height = '100px';

        const button = document.createElement('button')
        button.innerText = 'Submit'
        button.style.width = '100%'
        button.style.padding = '10px'
        button.addEventListener('click', () => {
            if (textarea.value.trim() === '') {
                alert('Result cannot be empty.');
            } else {
                resolve(textarea.value.trim());
                document.body.removeChild(inputContainer);
            }
        })

        inputContainer.appendChild(textarea);
        inputContainer.appendChild(button);
        document.body.appendChild(inputContainer);
        textarea.focus();
    })
}

const promptForFeedbackText = async (): Promise<string> => {
    return new Promise((resolve) => {
        const inputContainer = document.createElement('div')
        inputContainer.style.position = 'fixed'
        inputContainer.style.top = '50%'
        inputContainer.style.left = '50%'
        inputContainer.style.transform = 'translate(-50%, -50%)'
        inputContainer.style.zIndex = '1000'
        inputContainer.style.background = 'white'
        inputContainer.style.padding = '20px'
        inputContainer.style.boxShadow = '0 0 10px rgba(0, 0, 0, 0.1)'
        inputContainer.style.borderRadius = '8px'

        const textarea = document.createElement('textarea');
        textarea.placeholder = 'Enter Feadback';
        textarea.style.width = '100%';
        textarea.style.padding = '10px';
        textarea.style.marginBottom = '10px';
        textarea.style.boxSizing = 'border-box';
        textarea.style.height = '100px';

        const button = document.createElement('button')
        button.innerText = 'Submit'
        button.style.width = '100%'
        button.style.padding = '10px'
        button.addEventListener('click', () => {
            if (textarea.value.trim() === '') {
                alert('Feadback cannot be empty.');
            } else {
                resolve(textarea.value.trim());
                document.body.removeChild(inputContainer);
            }
        })

        inputContainer.appendChild(textarea);
        inputContainer.appendChild(button);
        document.body.appendChild(inputContainer);
        textarea.focus();
    })
}



// session log
export class PracticeLog {
    static readonly template: string =
        '## Goal\n {goal}\n' +
        '## Duration\n {duration}m\n' +
        '## Begin\n {begin|YYYY-MM-DD HH:mm}\n' +
        '## End\n {end|YYYY-MM-DD HH:mm}\n' +
        '## Result\n {result}\n' +
        '## Feedback\n {feedback}';

    goal: string; 
    duration: number; 
    begin: moment.Moment;
    end: moment.Moment; 
    mode: Mode; 
    result: string; 
    feedback: string; 

    constructor(
        mode: Mode,
        goal: string,
        duration: number,
        begin: moment.Moment,
        end: moment.Moment,
        result: string,
        feedback: string,
    ) {
        this.goal = goal;
        this.duration = duration;
        this.begin = begin;
        this.end = end;
        this.mode = mode;
        this.result = result;
        this.feedback = feedback;
    }

    text(): string {
        let template = PracticeLog.template;
        let line = template
            ? template.replace(/\{(.*?)}/g, (_, expression: string): string => {
                  let [key, format]: string[] = expression
                      .split('|')
                      .map((part: string) => part.trim());
                  let value = this[key as keyof PracticeLog] || '';

                  // Check if the value is a moment object and a format is provided
                  if (moment.isMoment(value) && format) {
                      return value.format(format);
                  }
                  return (value as string) || '';
              })
            : '';
        return `${line}`;
    }
}

/* Util Functions */
const saveGoal = async(log: PracticeLog): Promise<void> =>  {
    const settings = $plugin!.getSettings();
    let logPath = settings.logPath || settings.logPath.trim();
    let fileName = `${log.goal.replace(/[^\w\u4e00-\u9fa5]/g, '_')}_parctice.md`;
    let filePath = `${logPath}/${fileName}`;
    
    if (logPath !== '') {
        await ensureFolderExists(logPath);
        if (!(await $plugin!.app.vault.adapter.exists(filePath))) {
            await $plugin!.app.vault.create(filePath, log.text()); 
        } else {
            await appendFile(filePath, `\n${log.text()}`); 
        }
    }
}


const ensureFolderExists = async (path: string): Promise<void> => {
    const dirs = path.replace(/\\/g, '/').split('/')
    dirs.pop() // remove basename

    if (dirs.length) {
        const dir = join(...dirs)
        if (!$plugin.app.vault.getAbstractFileByPath(dir)) {
            await $plugin.app.vault.createFolder(dir)
        }
    }
}

const join = (...partSegments: string[]): string => {
    // Split the inputs into a list of path commands.
    let parts: string[] = []
    for (let i = 0, l = partSegments.length; i < l; i++) {
        parts = parts.concat(partSegments[i].split('/'))
    }
    // Interpret the path commands to get the new resolved path.
    const newParts = []
    for (let i = 0, l = parts.length; i < l; i++) {
        const part = parts[i]
        // Remove leading and trailing slashes
        // Also remove "." segments
        if (!part || part === '.') continue
        // Push new path segments.
        else newParts.push(part)
    }
    // Preserve the initial slash if there was one.
    if (parts[0] === '') newParts.unshift('')
    // Turn back into a single string path.
    return newParts.join('/')
}


const appendFile = async (filePath: string, logText: string): Promise<void> => {
    await $plugin!.app.vault.adapter.append(filePath, logText)
}

export const remained: Readable<TimerRemained> = derived(
    state as Writable<TimerState>,
    ($state) => {
        let remained = $state.count - $state.elapsed
        let min = Math.floor(remained / 60000)
        let sec = Math.floor((remained % 60000) / 1000)
        let minStr = min < 10 ? `0${min}` : min.toString()
        let secStr = sec < 10 ? `0${sec}` : sec.toString()

        return {
            millis: remained,
            human: `${minStr} : ${secStr}`,
        } as TimerRemained
    },
)

export const store = state as TimerStore

export type Mode = 'WORK' | 'BREAK'

export const clean = () => {
    store.pause()
    settingsUnsubsribe()
    pluginUnsubribe()
    stateUnsubribe()
	clock.terminate()
}
