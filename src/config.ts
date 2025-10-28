import { BaseDirectory, createDir, exists, readTextFile, writeTextFile } from "@tauri-apps/api/fs";
import { appConfigDir } from "@tauri-apps/api/path";
import { useState } from "react";

/**
 * Represents the user configuration file of Splicedd.
 */
export interface SpliceddConfig {
  sampleDir: string;
  placeholders: boolean;
  darkMode: boolean;
  preservePitch: boolean;
  waveformWidth: number;
  infiniteScroll?: boolean;

  configured: boolean;
}

let globalCfg: SpliceddConfig;
function defaultCfg(): SpliceddConfig {
  return {
    sampleDir: "",
    darkMode: true,
    placeholders: false,
    preservePitch: true,
    waveformWidth: 520,
    infiniteScroll: false,
    configured: false
  }
}

/**
 * Returns the global configuration object. The returned object should be treated as immutable. 
 */
export function cfg(): SpliceddConfig {
  return globalCfg;
}

/**
 * Changes select values of the user configuration and saves it to the config file.
 */
export async function mutateCfg(values: Partial<SpliceddConfig>) {
  globalCfg = { ...globalCfg, ...values }
  
  // Browser mode - save to localStorage
  if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
    localStorage.setItem('splice-config', JSON.stringify(globalCfg));
    return;
  }
  
  await saveConfig();
}

/**
 * Loads user configuration from the config file. Usually is called only called once on startup.
 */
export async function loadConfig() {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
    // Browser mode - use localStorage as fallback
    const savedConfig = localStorage.getItem('splice-config');
    if (savedConfig) {
      globalCfg = { ...defaultCfg(), ...JSON.parse(savedConfig) };
    } else {
      globalCfg = defaultCfg();
    }
    return;
  }

  // Tauri mode - use actual file system
  const appConfig = await appConfigDir();
  if (!await exists(appConfig))
    await createDir(appConfig);

  if (!await exists("config.json", { dir: BaseDirectory.AppConfig })) {
    globalCfg = defaultCfg();
  } else {
    const raw = await readTextFile("config.json", {
      dir: BaseDirectory.AppConfig,
    });

    const parsed = JSON.parse(raw);
    // Ensure defaults for newly added fields
    globalCfg = { ...defaultCfg(), ...parsed };
  }
}

/**
 * Synchronizes the in-memory configuration object with the config file stored on disk.
 */
export async function saveConfig() {
  // Browser mode - use localStorage
  if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
    localStorage.setItem('splice-config', JSON.stringify(globalCfg));
    return;
  }
  
  await writeTextFile("config.json", JSON.stringify(globalCfg, null, 2), {
    dir: BaseDirectory.AppConfig
  });
}

/**
 * Represents the synchronized state between a React component and the configuration object.
 */
interface ConfigSyncedState<T> {
  key: keyof SpliceddConfig;
  state: T;
  setState: React.Dispatch<React.SetStateAction<T>>
}

/**
 * Allows for synchronization between React components and a single key-value pair of the configuration object.
 */
export function useCfgSyncedState<T>(key: keyof SpliceddConfig) {
  const [state, setState] = useState<T>(globalCfg[key] as T);
  return { key, state, setState }
}

/**
 * Changes the value of the key specified by the target `state` to the given `value`,
 * synchronizing it with the configuration object and the config file.
 */
export function mutateCfgSync<T>(value: T, state: ConfigSyncedState<T>) {
  (globalCfg as any)[state.key] = value;
  state.setState(value);
  saveConfig();
}