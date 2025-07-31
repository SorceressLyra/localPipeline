
export interface Pipeline {
   
    /**
     * Executes the pipeline with the given input.
     * @param input The input data for the pipeline.
     * @returns The output of the pipeline.
     */
    execute(inputPath: string): Boolean | undefined;
}