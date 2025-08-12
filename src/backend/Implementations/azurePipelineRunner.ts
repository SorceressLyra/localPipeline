import { Pipeline } from "../pipelineInterface";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

interface AzurePipeline {
    trigger?: string[] | string | { branches?: any; paths?: any };
    pr?: string[] | string | { branches?: any; paths?: any };
    pool?: {
        vmImage?: string;
        name?: string;
        demands?: string[];
    };
    variables?: Record<string, any> | any[];
    stages?: AzureStage[];
    jobs?: AzureJob[];
    steps?: AzureStep[];
    resources?: any;
    name?: string;
}

interface AzureStage {
    stage?: string;
    displayName?: string;
    dependsOn?: string | string[];
    condition?: string;
    variables?: Record<string, any>;
    jobs: AzureJob[];
}

interface AzureJob {
    job?: string;
    displayName?: string;
    dependsOn?: string | string[];
    condition?: string;
    pool?: any;
    variables?: Record<string, any>;
    steps: AzureStep[];
    strategy?: any;
    timeoutInMinutes?: number;
}

interface AzureStep {
    task?: string;
    displayName?: string;
    inputs?: Record<string, any>;
    script?: string;
    powershell?: string;
    bash?: string;
    condition?: string;
    continueOnError?: boolean;
    enabled?: boolean;
    env?: Record<string, string>;
    workingDirectory?: string;
}

export class AzurePipelineRunner implements Pipeline {
    private verbose: boolean = false;
    private workingDirectory: string = '';
    private variables: Record<string, any> = {};

    constructor(verbose: boolean = false) {
        this.verbose = verbose;
    }

    execute(inputPath: string, workflow?: string): Boolean | undefined {
        try {
            const pipelineFile = this.findPipelineFile(inputPath);
            if (!pipelineFile) {
                this.log(chalk.red('❌ No Azure Pipelines file found'));
                return false;
            }

            this.workingDirectory = path.dirname(inputPath);
            if (!path.isAbsolute(this.workingDirectory)) {
                this.workingDirectory = path.resolve(this.workingDirectory);
            }

            this.log(chalk.blue(`🔍 Found Azure Pipeline: ${pipelineFile}`));
            
            const pipeline = this.parsePipeline(pipelineFile);
            if (!pipeline) {
                this.log(chalk.red('❌ Failed to parse pipeline file'));
                return false;
            }

            this.log(chalk.green(`🚀 Starting Azure Pipeline: ${pipeline.name || 'Unnamed Pipeline'}`));
            
            // Note: Azure Pipelines typically have one pipeline per file, but could have multiple stages
            // The workflow parameter could be used to target specific stages in the future
            if (workflow) {
                this.log(chalk.blue(`🎯 Note: Azure Pipelines typically have one workflow per file. Ignoring workflow parameter: ${workflow}`));
            }
            
            return this.executePipeline(pipeline);

        } catch (error) {
            this.log(chalk.red(`❌ Error executing Azure Pipeline: ${error}`));
            return false;
        }
    }

    listWorkflows(inputPath: string): string[] {
        // Azure Pipelines typically have one pipeline per file
        // Could return stage names in the future
        return ['default'];
    }

    private findPipelineFile(inputPath: string): string | null {
        // If inputPath is a specific pipeline file
        if (inputPath.endsWith('.yml') || inputPath.endsWith('.yaml')) {
            if (fs.existsSync(inputPath)) {
                return inputPath;
            }
        }

        // Look for common Azure Pipelines file names
        const possibleFiles = [
            path.join(inputPath, 'azure-pipelines.yml'),
            path.join(inputPath, 'azure-pipelines.yaml'),
            path.join(inputPath, '.azure-pipelines.yml'),
            path.join(inputPath, 'pipelines', 'azure-pipelines.yml'),
            path.join(path.dirname(inputPath), 'azure-pipelines.yml'),
            path.join(path.dirname(inputPath), 'azure-pipelines.yaml')
        ];

        for (const file of possibleFiles) {
            if (fs.existsSync(file)) {
                return file;
            }
        }

        return null;
    }

    private parsePipeline(filePath: string): AzurePipeline | null {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return yaml.load(content) as AzurePipeline;
        } catch (error) {
            this.log(chalk.red(`Failed to parse pipeline file: ${error}`));
            return null;
        }
    }

    private executePipeline(pipeline: AzurePipeline): boolean {
        try {
            // Initialize variables
            this.initializeVariables(pipeline.variables);

            // Simulate pool/agent
            if (pipeline.pool) {
                this.log(chalk.blue(`🖥️  Agent Pool: ${pipeline.pool.vmImage || pipeline.pool.name || 'default'}`));
            }

            // Execute pipeline structure
            if (pipeline.stages) {
                return this.executeStages(pipeline.stages);
            } else if (pipeline.jobs) {
                return this.executeJobs(pipeline.jobs);
            } else if (pipeline.steps) {
                return this.executeSteps(pipeline.steps);
            } else {
                this.log(chalk.yellow('⚠️  No stages, jobs, or steps found in pipeline'));
                return true;
            }

        } catch (error) {
            this.log(chalk.red(`❌ Pipeline execution failed: ${error}`));
            return false;
        }
    }

    private initializeVariables(variables?: Record<string, any> | any[]): void {
        if (!variables) return;

        if (Array.isArray(variables)) {
            // Handle variable groups and structured variables
            for (const varItem of variables) {
                if (typeof varItem === 'object') {
                    Object.assign(this.variables, varItem);
                }
            }
        } else {
            Object.assign(this.variables, variables);
        }

        // Add common Azure Pipelines variables
        this.variables['Build.SourcesDirectory'] = this.workingDirectory;
        this.variables['Build.Repository.Name'] = path.basename(this.workingDirectory);
        this.variables['Agent.BuildDirectory'] = this.workingDirectory;
        this.variables['System.DefaultWorkingDirectory'] = this.workingDirectory;

        if (this.verbose) {
            this.log(chalk.gray(`📝 Variables: ${JSON.stringify(this.variables, null, 2)}`));
        }
    }

    private executeStages(stages: AzureStage[]): boolean {
        this.log(chalk.blue(`📋 Found ${stages.length} stage(s)`));

        for (const stage of stages) {
            this.log(chalk.yellow(`\n🎭 Starting stage: ${stage.displayName || stage.stage || 'Unnamed Stage'}`));
            
            if (!this.executeJobs(stage.jobs)) {
                this.log(chalk.red(`❌ Stage '${stage.stage}' failed`));
                return false;
            }
            
            this.log(chalk.green(`✅ Stage '${stage.stage}' completed successfully`));
        }

        return true;
    }

    private executeJobs(jobs: AzureJob[]): boolean {
        this.log(chalk.blue(`📋 Found ${jobs.length} job(s)`));

        for (const job of jobs) {
            this.log(chalk.yellow(`\n🔧 Starting job: ${job.displayName || job.job || 'Unnamed Job'}`));
            
            if (!this.executeSteps(job.steps)) {
                this.log(chalk.red(`❌ Job '${job.job}' failed`));
                return false;
            }
            
            this.log(chalk.green(`✅ Job '${job.job}' completed successfully`));
        }

        return true;
    }

    private executeSteps(steps: AzureStep[]): boolean {
        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            this.log(chalk.cyan(`    Step ${i + 1}: ${step.displayName || step.task || 'Script'}`));

            if (!this.executeStep(step)) {
                this.log(chalk.red(`    ❌ Step ${i + 1} failed`));
                return false;
            }

            this.log(chalk.green(`    ✅ Step ${i + 1} completed`));
        }

        return true;
    }

    private executeStep(step: AzureStep): boolean {
        try {
            if (step.task) {
                return this.executeTask(step);
            } else if (step.script || step.bash || step.powershell) {
                return this.executeScript(step);
            } else {
                this.log(chalk.yellow(`    ⚠️  Step has no task or script - skipping`));
                return true;
            }

        } catch (error) {
            this.log(chalk.red(`    ❌ Step execution failed: ${error}`));
            return false;
        }
    }

    private executeTask(step: AzureStep): boolean {
        const task = step.task!;
        const inputs = step.inputs || {};

        // Simulate common Azure DevOps tasks
        if (task.startsWith('NodeTool@') || task === 'NodeTool') {
            const version = inputs.versionSpec || '18.x';
            this.log(chalk.blue(`      📦 Simulating Node.js setup (version: ${version})`));
            return true;
        }

        if (task.startsWith('UsePythonVersion@') || task === 'UsePythonVersion') {
            const version = inputs.versionSpec || '3.x';
            this.log(chalk.blue(`      🐍 Simulating Python setup (version: ${version})`));
            return true;
        }

        if (task.startsWith('PublishBuildArtifacts@') || task === 'PublishBuildArtifacts') {
            const artifactName = inputs.ArtifactName || 'drop';
            this.log(chalk.blue(`      📦 Simulating artifact publication: ${artifactName}`));
            return true;
        }

        if (task.startsWith('DownloadBuildArtifacts@') || task === 'DownloadBuildArtifacts') {
            const artifactName = inputs.artifactName || 'drop';
            this.log(chalk.blue(`      📥 Simulating artifact download: ${artifactName}`));
            return true;
        }

        // For other tasks, just log that we're simulating them
        this.log(chalk.blue(`      🎬 Simulating task: ${task}`));
        return true;
    }

    private executeScript(step: AzureStep): boolean {
        try {
            let script = '';
            let shell = 'bash';

            if (step.script) {
                script = step.script;
                shell = 'bash';
            } else if (step.bash) {
                script = step.bash;
                shell = 'bash';
            } else if (step.powershell) {
                script = step.powershell;
                shell = 'powershell';
            }

            const workingDir = step.workingDirectory || this.workingDirectory;

            this.log(chalk.blue(`      🔧 Executing ${shell} script in ${workingDir}`));
            
            if (this.verbose) {
                this.log(chalk.gray(`      📜 Script: ${script}`));
            }

            // Replace Azure Pipelines variables in the script
            const processedScript = this.replaceVariables(script);

            // Execute the script
            const env = { ...process.env, ...step.env, ...this.variables };
            const options = {
                cwd: workingDir,
                env: env,
                stdio: this.verbose ? 'inherit' : 'pipe',
                encoding: 'utf8'
            } as const;

            try {
                const result = execSync(processedScript, options);
                if (!this.verbose && result) {
                    this.log(chalk.gray(`      📄 Output: ${result.toString().trim()}`));
                }
                return true;
            } catch (error: any) {
                this.log(chalk.red(`      ❌ Script failed with exit code: ${error.status || 'unknown'}`));
                if (error.stdout) {
                    this.log(chalk.gray(`      📄 stdout: ${error.stdout.toString()}`));
                }
                if (error.stderr) {
                    this.log(chalk.red(`      📄 stderr: ${error.stderr.toString()}`));
                }
                return step.continueOnError || false;
            }

        } catch (error) {
            this.log(chalk.red(`      ❌ Script execution error: ${error}`));
            return step.continueOnError || false;
        }
    }

    private replaceVariables(text: string): string {
        // Replace Azure Pipelines variable syntax $(Variable) with actual values
        return text.replace(/\$\(([^)]+)\)/g, (match, varName) => {
            const value = this.variables[varName];
            return value !== undefined ? String(value) : match;
        });
    }

    private log(message: string): void {
        console.log(message);
    }
}