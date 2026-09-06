import { NativeModules } from 'react-native';
import { CompanionMode } from '../constants/appConstants';
import type { Embodiment } from './Embodiment';

type TtsNative = {
  speak(text: string): Promise<boolean>;
  stop(): Promise<boolean>;
};

const tts = NativeModules.TtsBridge as TtsNative | undefined;

export class PhoneEmbodiment implements Embodiment {
  private dockMode: CompanionMode = CompanionMode.OPERATOR;
  private lastEmotion = 'neutral';

  async speak(text: string): Promise<void> {
    if (!tts) {
      return;
    }
    await tts.speak(text);
  }

  async express(emotion: string): Promise<void> {
    this.lastEmotion = emotion;
  }

  async move(_command: string): Promise<void> {
    // Phone body has no locomotion.
  }

  async present(mode: CompanionMode): Promise<void> {
    this.dockMode = mode;
  }

  getMode(): CompanionMode {
    return this.dockMode;
  }

  getEmotion(): string {
    return this.lastEmotion;
  }
}

export const phoneEmbodiment = new PhoneEmbodiment();
