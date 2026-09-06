import { CompanionMode } from '../constants/appConstants';

/** Physical / phone body surface — robot embodiment later implements the same contract. */
export interface Embodiment {
  speak(text: string): Promise<void>;
  express(emotion: string): Promise<void>;
  /** Physical locomotion — no-op on phone. */
  move(command: string): Promise<void>;
  present(mode: CompanionMode): Promise<void>;
}
