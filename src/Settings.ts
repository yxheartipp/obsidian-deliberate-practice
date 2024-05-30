import type DeliberatePracticePlugin from 'main'
import { Notice, PluginSettingTab, Setting } from 'obsidian'
import type { Unsubscriber } from 'svelte/motion'
import { writable, type Writable } from 'svelte/store'


export interface Settings {
    workLen: number
    breakLen: number
    autostart: boolean
    logPath: string
    goal : string
}

export default class DeliberatePracticeSettings extends PluginSettingTab {
    static readonly DEFAULT_SETTINGS: Settings = {
        workLen: 25,
        breakLen: 5,
        autostart: false,
        logPath: '',
        goal: '',
    }

    static settings: Writable<Settings> = writable(
        DeliberatePracticeSettings.DEFAULT_SETTINGS,
    )

    private _settings: Settings

    private plugin: DeliberatePracticePlugin

    private unsubscribe: Unsubscriber

    constructor(plugin: DeliberatePracticePlugin, settings: Settings) {
        super(plugin.app, plugin)
        this.plugin = plugin
        this._settings = { ...DeliberatePracticeSettings.DEFAULT_SETTINGS, ...settings }
        DeliberatePracticeSettings.settings.set(this._settings)
        this.unsubscribe = DeliberatePracticeSettings.settings.subscribe((settings) => {
            this.plugin.saveData(settings)
            this._settings = settings
        })
    }

    public getSettings(): Settings {
        return this._settings
    }

    public updateSettings = (
        newSettings: Partial<Settings>,
        refreshUI: boolean = false,
    ) => {
        DeliberatePracticeSettings.settings.update((settings) => {
            this._settings = { ...settings, ...newSettings }
            if (refreshUI) {
                this.display()
            }
            return this._settings
        })
    }

    public resetGoal() {
        this._settings.goal = ''
        this.display()
    }

    public unload() {
        this.unsubscribe()
    }

    public display() {
        const { containerEl } = this
        containerEl.empty()

        new Setting(containerEl)
            .setName('Log file')
            .setDesc('The file to log pomodoro sessions to')
            .addText((text) => {
                text.inputEl.style.width = '300px'
                text.setValue(this._settings.logPath)
                text.onChange((value) => {
                    this.updateSettings({ logPath: value })
                })
            })

        new Setting(containerEl).addButton((button) => {
            button.setButtonText('Restore settings')
            button.onClick(() => {
                this.updateSettings(DeliberatePracticeSettings.DEFAULT_SETTINGS, true)
            })
        })
    }
}
