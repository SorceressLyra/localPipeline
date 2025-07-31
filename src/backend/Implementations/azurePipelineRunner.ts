import { Pipeline } from "../pipelineInterface";

export class AzurePipelineRunner implements Pipeline {
    execute(inputPath: string): Boolean | undefined {
        return true;
    }
}