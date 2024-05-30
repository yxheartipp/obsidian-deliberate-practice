import { writable } from 'svelte/store'
import type DeliberatePracticePlugin from './main'
import DeliberatePracticeSettings from 'Settings'

export const plugin = writable<DeliberatePracticePlugin>()
export const settings = DeliberatePracticeSettings.settings
export const goal = writable<string>('') 
export const startTime = writable<Date>()

export default {
    plugin,
    settings,
}