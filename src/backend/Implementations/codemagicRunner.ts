import { Pipeline } from "../pipelineInterface";

export class CodeMagic implements Pipeline{
    execute(inputPath: string): Boolean | undefined {

        return true;
    }
}