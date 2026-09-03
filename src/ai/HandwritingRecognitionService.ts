import { BoardObject } from '../models/BoardObject';

export type RecognitionMode = 'math' | 'text';

export interface RecognitionResultBase {
  mode: RecognitionMode;
  sourceObjectIds: string[];
  recognizedText: string;
  summary: string;
  confidence?: number;
  structuredData?: unknown;
}

export interface TextRecognitionResult extends RecognitionResultBase {
  mode: 'text';
}

export interface MathRecognitionResult extends RecognitionResultBase {
  mode: 'math';
  equation: string;
  latex: string;
  solution?: string;
}

export interface TextRecognitionProvider {
  recognizeText(strokes: BoardObject[], imageBase64?: string): Promise<TextRecognitionResult>;
}

export interface MathRecognitionProvider {
  recognizeMath(strokes: BoardObject[], imageBase64?: string): Promise<MathRecognitionResult>;
}

export interface RecognitionProvider
  extends TextRecognitionProvider,
    MathRecognitionProvider {}



export class RecognitionService {
  constructor(private provider: RecognitionProvider) {}

  public recognize(
    mode: RecognitionMode,
    strokes: BoardObject[],
    imageBase64?: string
  ): Promise<RecognitionResultBase> {
    switch (mode) {
      case 'math':
        return this.provider.recognizeMath(strokes, imageBase64);
      case 'text':
      default:
        return this.provider.recognizeText(strokes, imageBase64);
    }
  }
}

export class ApiRecognitionProvider implements RecognitionProvider {
  private async analyze(mode: string, strokes: BoardObject[], imageBase64?: string): Promise<any> {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          user_id: null,
          board_id: null,
          mode: mode,
          selected_content: strokes,
          image: imageBase64 || null
        })
      });
      
      if (!response.ok) {
        let errorMessage = `API returned ${response.status}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.detail) {
            errorMessage = errorData.detail;
          }
        } catch (parseErr) {
          // Ignore JSON parse errors if response is not JSON
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Unknown API error');
      }
      return data;
    } catch (e) {
      console.error("API call failed", e);
      throw e;
    }
  }

  public async recognizeText(strokes: BoardObject[], imageBase64?: string): Promise<TextRecognitionResult> {
    const data = await this.analyze('text', strokes, imageBase64);
    const sourceObjectIds = strokes.map(s => s.id);
    return {
      mode: 'text',
      sourceObjectIds,
      recognizedText: data.result?.recognized_content || '',
      summary: data.result?.explanation || 'Text recognized',
      confidence: data.detection?.confidence,
      structuredData: data.result?.data
    };
  }

  public async recognizeMath(strokes: BoardObject[], imageBase64?: string): Promise<MathRecognitionResult> {
    const data = await this.analyze('math', strokes, imageBase64);
    const sourceObjectIds = strokes.map(s => s.id);
    return {
      mode: 'math',
      sourceObjectIds,
      recognizedText: data.result?.recognized_content || '',
      summary: data.result?.explanation || 'Math recognized',
      confidence: data.detection?.confidence,
      equation: data.result?.recognized_content || '',
      latex: data.result?.recognized_content || '',
      solution: data.result?.data?.solution,
      structuredData: data.result?.data
    };
  }


}

export class HandwritingRecognitionService extends RecognitionService {}

