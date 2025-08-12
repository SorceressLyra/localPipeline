
export interface Pipeline {
   
    /**
     * Executes the pipeline with the given input.
     * @param input The input data for the pipeline.
     * @param workflow Optional workflow name to execute (for multi-workflow files).
     * @returns The output of the pipeline.
     */
    execute(inputPath: string, workflow?: string): Boolean | undefined | Promise<Boolean | undefined>;

    /**
     * Lists available workflows in the pipeline.
     * @param input The input data for the pipeline.
     * @returns Array of workflow names.
     */
    listWorkflows?(inputPath: string): string[];
}