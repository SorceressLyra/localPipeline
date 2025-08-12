import { Pipeline } from "../pipelineInterface";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface GitHubWorkflow {
    name?: string;
    on: any;
    env?: Record<string, string>;
    jobs: Record<string, GitHubJob>;
}

interface GitHubJob {
    name?: string;
    'runs-on': string;
    env?: Record<string, string>;
    steps: GitHubStep[];
    needs?: string | string[];
    if?: string;
    strategy?: any;
    'timeout-minutes'?: number;
}

interface GitHubStep {
    name?: string;
    uses?: string;
    run?: string;
    with?: Record<string, any>;
    env?: Record<string, string>;
    if?: string;
    id?: string;
    'working-directory'?: string;
    shell?: string;
}

export class GitHubActionsRunner implements Pipeline {
    private verbose: boolean = false;
    private workingDirectory: string = '';

    constructor(verbose: boolean = false) {
        this.verbose = verbose;
    }

    async execute(inputPath: string, workflow?: string): Promise<Boolean | undefined> {
        try {
            let workflowPath: string | null;
            
            if (workflow) {
                // User specified a workflow
                workflowPath = this.findWorkflowFile(inputPath, workflow);
                if (!workflowPath) {
                    this.log(chalk.red(`❌ Workflow '${workflow}' not found`));
                    const allFiles = this.findAllWorkflowFiles(inputPath);
                    if (allFiles.length > 0) {
                        const workflowNames = allFiles.map(file => path.basename(file, path.extname(file)));
                        this.log(chalk.blue(`Available workflows: ${workflowNames.join(', ')}`));
                    }
                    return false;
                }
            } else {
                // Check if multiple workflows exist
                const allFiles = this.findAllWorkflowFiles(inputPath);
                if (allFiles.length > 1) {
                    this.log(chalk.yellow('🤔 Multiple workflows found. Please select one:'));
                    workflowPath = await this.promptForWorkflowSelection(allFiles);
                    if (!workflowPath) {
                        return false;
                    }
                } else {
                    workflowPath = this.findWorkflowFile(inputPath);
                }
            }

            if (!workflowPath) {
                this.log(chalk.red('❌ No GitHub workflow file found'));
                return false;
            }

            this.workingDirectory = path.dirname(inputPath);
            if (!path.isAbsolute(this.workingDirectory)) {
                this.workingDirectory = path.resolve(this.workingDirectory);
            }

            this.log(chalk.blue(`🔍 Found GitHub workflow: ${workflowPath}`));
            
            const workflowObj = this.parseWorkflow(workflowPath);
            if (!workflowObj) {
                this.log(chalk.red('❌ Failed to parse workflow file'));
                return false;
            }

            this.log(chalk.green(`🚀 Starting workflow: ${workflowObj.name || 'Unnamed Workflow'}`));
            
            return this.executeWorkflow(workflowObj);

        } catch (error) {
            this.log(chalk.red(`❌ Error executing GitHub workflow: ${error}`));
            return false;
        }
    }

    private async promptForWorkflowSelection(workflowFiles: string[]): Promise<string | null> {
        try {
            const choices = workflowFiles.map(file => {
                const baseName = path.basename(file, path.extname(file));
                let description = 'No description';
                
                // Try to get workflow name from file content
                try {
                    const content = fs.readFileSync(file, 'utf8');
                    const parsed = yaml.load(content) as any;
                    if (parsed?.name) {
                        description = parsed.name;
                    }
                } catch (error) {
                    // Ignore parsing errors for description
                }

                return {
                    name: `${baseName} - ${description}`,
                    value: file,
                    short: baseName
                };
            });

            const answer = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'workflow',
                    message: 'Select a workflow to execute:',
                    choices: choices,
                    pageSize: 10
                }
            ]);

            return answer.workflow;

        } catch (error) {
            this.log(chalk.red(`❌ Workflow selection failed: ${error}`));
            return null;
        }
    }

    listWorkflows(inputPath: string): string[] {
        try {
            const workflowFiles = this.findAllWorkflowFiles(inputPath);
            return workflowFiles.map(file => path.basename(file, path.extname(file)));
        } catch (error) {
            return [];
        }
    }

    private findWorkflowFile(inputPath: string, targetWorkflow?: string): string | null {
        // If inputPath is a specific workflow file
        if (inputPath.endsWith('.yml') || inputPath.endsWith('.yaml')) {
            if (fs.existsSync(inputPath)) {
                return inputPath;
            }
        }

        // Look for workflow files in .github/workflows directory
        const workflowDirs = [
            path.join(inputPath, '.github', 'workflows'),
            path.join(path.dirname(inputPath), '.github', 'workflows')
        ];

        for (const dir of workflowDirs) {
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir)
                    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
                    .map(file => path.join(dir, file));
                
                if (targetWorkflow) {
                    // Look for specific workflow by name
                    const targetFile = files.find(file => {
                        const baseName = path.basename(file, path.extname(file));
                        return baseName === targetWorkflow;
                    });
                    if (targetFile) {
                        return targetFile;
                    }
                }
                
                if (files.length > 0) {
                    return files[0]; // Return first workflow file found
                }
            }
        }

        return null;
    }

    private findAllWorkflowFiles(inputPath: string): string[] {
        const files: string[] = [];
        
        // Look for workflow files in .github/workflows directory
        const workflowDirs = [
            path.join(inputPath, '.github', 'workflows'),
            path.join(path.dirname(inputPath), '.github', 'workflows')
        ];

        for (const dir of workflowDirs) {
            if (fs.existsSync(dir)) {
                const dirFiles = fs.readdirSync(dir)
                    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
                    .map(file => path.join(dir, file));
                files.push(...dirFiles);
            }
        }

        return files;
    }

    private parseWorkflow(filePath: string): GitHubWorkflow | null {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return yaml.load(content) as GitHubWorkflow;
        } catch (error) {
            this.log(chalk.red(`Failed to parse workflow file: ${error}`));
            return null;
        }
    }

    private executeWorkflow(workflow: GitHubWorkflow): boolean {
        try {
            // Set global environment variables
            const globalEnv = { ...process.env, ...workflow.env };

            // Execute jobs in order (simplified - doesn't handle complex dependencies)
            const jobNames = Object.keys(workflow.jobs);
            this.log(chalk.blue(`📋 Found ${jobNames.length} job(s): ${jobNames.join(', ')}`));

            for (const [jobName, job] of Object.entries(workflow.jobs)) {
                this.log(chalk.yellow(`\n🔧 Starting job: ${job.name || jobName}`));
                
                if (!this.executeJob(jobName, job, globalEnv)) {
                    this.log(chalk.red(`❌ Job '${jobName}' failed`));
                    return false;
                }
                
                this.log(chalk.green(`✅ Job '${jobName}' completed successfully`));
            }

            this.log(chalk.green('\n🎉 Workflow completed successfully'));
            return true;

        } catch (error) {
            this.log(chalk.red(`❌ Workflow execution failed: ${error}`));
            return false;
        }
    }

    private executeJob(jobName: string, job: GitHubJob, globalEnv: Record<string, any>): boolean {
        try {
            // Merge environment variables
            const jobEnv = { ...globalEnv, ...job.env };

            // Simulate runner environment
            this.log(chalk.blue(`  🖥️  Running on: ${job['runs-on']}`));

            // Execute steps
            for (let i = 0; i < job.steps.length; i++) {
                const step = job.steps[i];
                this.log(chalk.cyan(`    Step ${i + 1}: ${step.name || step.uses || 'Unnamed step'}`));

                if (!this.executeStep(step, jobEnv)) {
                    this.log(chalk.red(`    ❌ Step ${i + 1} failed`));
                    return false;
                }

                this.log(chalk.green(`    ✅ Step ${i + 1} completed`));
            }

            return true;

        } catch (error) {
            this.log(chalk.red(`❌ Job execution failed: ${error}`));
            return false;
        }
    }

    private executeStep(step: GitHubStep, env: Record<string, any>): boolean {
        try {
            // Merge step-level environment variables
            const stepEnv = { ...env, ...step.env };

            // Handle different step types
            if (step.uses) {
                return this.executeAction(step, stepEnv);
            } else if (step.run) {
                return this.executeScript(step, stepEnv);
            } else {
                this.log(chalk.yellow(`    ⚠️  Step has no 'uses' or 'run' - skipping`));
                return true;
            }

        } catch (error) {
            this.log(chalk.red(`    ❌ Step execution failed: ${error}`));
            return false;
        }
    }

    private executeAction(step: GitHubStep, env: Record<string, any>): boolean {
        const action = step.uses!;
        
        // Simulate common GitHub Actions
        if (action.startsWith('actions/checkout')) {
            this.log(chalk.blue(`      📥 Simulating checkout action`));
            // In a real implementation, this would checkout the repository
            return true;
        }
        
        if (action.startsWith('actions/setup-node')) {
            const version = step.with?.['node-version'] || '18';
            this.log(chalk.blue(`      📦 Simulating Node.js setup (version: ${version})`));
            // In a real implementation, this would setup Node.js
            return true;
        }

        if (action.startsWith('actions/setup-python')) {
            const version = step.with?.['python-version'] || '3.x';
            this.log(chalk.blue(`      🐍 Simulating Python setup (version: ${version})`));
            return true;
        }

        // For other actions, just log that we're simulating them
        this.log(chalk.blue(`      🎬 Simulating action: ${action}`));
        return true;
    }

    private executeScript(step: GitHubStep, env: Record<string, any>): boolean {
        try {
            const script = step.run!;
            const workingDir = step['working-directory'] || this.workingDirectory;
            const shell = step.shell || 'bash';

            this.log(chalk.blue(`      🔧 Executing script in ${workingDir}`));
            
            if (this.verbose) {
                this.log(chalk.gray(`      📜 Script: ${script}`));
            }

            // Execute the script
            const options = {
                cwd: workingDir,
                env: env,
                stdio: this.verbose ? 'inherit' : 'pipe',
                encoding: 'utf8'
            } as const;

            try {
                const result = execSync(script, options);
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
                return false;
            }

        } catch (error) {
            this.log(chalk.red(`      ❌ Script execution error: ${error}`));
            return false;
        }
    }

    private log(message: string): void {
        console.log(message);
    }
}
