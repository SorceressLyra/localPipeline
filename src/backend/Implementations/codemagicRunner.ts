import { Pipeline } from "../pipelineInterface";
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';

interface CodeMagicConfig {
    definitions?: {
        scripts?: any[];
    };
    workflows: Record<string, CodeMagicWorkflow>;
}

interface CodeMagicWorkflow {
    name: string;
    instance_type?: string;
    max_build_duration?: number;
    environment?: {
        groups?: string[];
        vars?: Record<string, any>;
        flutter?: string;
        xcode?: string;
        cocoapods?: string;
        android_signing?: string[];
        ios_signing?: any;
    };
    cache?: {
        cache_paths?: string[];
    };
    triggering?: {
        events?: string[];
        branch_patterns?: any[];
    };
    scripts: (string | ScriptStep)[];
    artifacts?: string[];
    publishing?: {
        email?: any;
        google_play?: any;
        app_store_connect?: any;
    };
    integrations?: Record<string, string>;
}

interface ScriptStep {
    name: string;
    script: string;
    working_directory?: string;
    test_report?: string;
}

export class CodeMagicRunner implements Pipeline {
    private verbose: boolean = false;
    private workingDirectory: string = '';
    private environment: Record<string, any> = {};
    private scriptDefinitions: Record<string, ScriptStep> = {};

    constructor(verbose: boolean = false) {
        this.verbose = verbose;
    }

    async execute(inputPath: string, workflow?: string): Promise<Boolean | undefined> {
        try {
            const configFile = this.findConfigFile(inputPath);
            if (!configFile) {
                this.log(chalk.red('❌ No CodeMagic configuration file found'));
                return false;
            }

            this.workingDirectory = path.dirname(inputPath);
            if (!path.isAbsolute(this.workingDirectory)) {
                this.workingDirectory = path.resolve(this.workingDirectory);
            }

            this.log(chalk.blue(`🔍 Found CodeMagic config: ${configFile}`));
            
            const config = this.parseConfig(configFile);
            if (!config) {
                this.log(chalk.red('❌ Failed to parse CodeMagic configuration'));
                return false;
            }

            // Parse script definitions
            this.parseScriptDefinitions(config.definitions);

            this.log(chalk.green(`🚀 Starting CodeMagic workflows`));
            
            return await this.executeConfig(config, workflow);

        } catch (error) {
            this.log(chalk.red(`❌ Error executing CodeMagic workflow: ${error}`));
            return false;
        }
    }

    listWorkflows(inputPath: string): string[] {
        try {
            const configFile = this.findConfigFile(inputPath);
            if (!configFile) {
                return [];
            }

            const config = this.parseConfig(configFile);
            if (!config) {
                return [];
            }

            return Object.keys(config.workflows);
        } catch (error) {
            return [];
        }
    }

    private findConfigFile(inputPath: string): string | null {
        // If inputPath is a specific config file
        if (inputPath.endsWith('.yaml') || inputPath.endsWith('.yml')) {
            if (fs.existsSync(inputPath)) {
                return inputPath;
            }
        }

        // Look for common CodeMagic configuration files
        const possibleFiles = [
            path.join(inputPath, 'codemagic.yaml'),
            path.join(inputPath, 'codemagic.yml'),
            path.join(inputPath, '.codemagic.yaml'),
            path.join(inputPath, '.codemagic.yml'),
            path.join(path.dirname(inputPath), 'codemagic.yaml'),
            path.join(path.dirname(inputPath), 'codemagic.yml')
        ];

        for (const file of possibleFiles) {
            if (fs.existsSync(file)) {
                return file;
            }
        }

        return null;
    }

    private parseConfig(filePath: string): CodeMagicConfig | null {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return yaml.load(content) as CodeMagicConfig;
        } catch (error) {
            this.log(chalk.red(`Failed to parse CodeMagic config: ${error}`));
            return null;
        }
    }

    private parseScriptDefinitions(definitions?: { scripts?: any[] }): void {
        if (!definitions?.scripts) return;

        for (const scriptDef of definitions.scripts) {
            if (Array.isArray(scriptDef)) {
                // Handle array format with YAML anchors
                for (const item of scriptDef) {
                    if (typeof item === 'object' && item.name && item.script) {
                        const key = item.name.toLowerCase().replace(/\s+/g, '_');
                        this.scriptDefinitions[key] = item;
                    }
                }
            } else if (typeof scriptDef === 'object' && scriptDef.name && scriptDef.script) {
                const key = scriptDef.name.toLowerCase().replace(/\s+/g, '_');
                this.scriptDefinitions[key] = scriptDef;
            }
        }

        if (this.verbose && Object.keys(this.scriptDefinitions).length > 0) {
            this.log(chalk.gray(`📝 Found ${Object.keys(this.scriptDefinitions).length} script definitions`));
        }
    }

    private async executeConfig(config: CodeMagicConfig, targetWorkflow?: string): Promise<boolean> {
        try {
            const workflowNames = Object.keys(config.workflows);
            this.log(chalk.blue(`📋 Found ${workflowNames.length} workflow(s): ${workflowNames.join(', ')}`));

            let workflowToExecute: string;
            
            if (targetWorkflow) {
                // User specified a workflow
                if (!config.workflows[targetWorkflow]) {
                    this.log(chalk.red(`❌ Workflow '${targetWorkflow}' not found`));
                    this.log(chalk.blue(`Available workflows: ${workflowNames.join(', ')}`));
                    return false;
                }
                workflowToExecute = targetWorkflow;
            } else if (workflowNames.length > 1) {
                // Multiple workflows available, prompt user to select
                this.log(chalk.yellow('🤔 Multiple workflows found. Please select one:'));
                return await this.promptForWorkflowSelection(config, workflowNames);
            } else {
                // Use the first (and only) workflow
                workflowToExecute = workflowNames[0];
                if (!workflowToExecute) {
                    this.log(chalk.yellow('⚠️  No workflows found'));
                    return true;
                }
            }

            const workflow = config.workflows[workflowToExecute];
            this.log(chalk.yellow(`\n🔧 Executing workflow: ${workflow.name || workflowToExecute}`));

            return this.executeWorkflow(workflow);

        } catch (error) {
            this.log(chalk.red(`❌ Configuration execution failed: ${error}`));
            return false;
        }
    }

    private async promptForWorkflowSelection(config: CodeMagicConfig, workflowNames: string[]): Promise<boolean> {
        try {
            const choices = workflowNames.map(name => {
                const workflow = config.workflows[name];
                return {
                    name: `${name} - ${workflow.name || 'No description'}`,
                    value: name,
                    short: name
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

            const selectedWorkflow = config.workflows[answer.workflow];
            this.log(chalk.yellow(`\n🔧 Executing selected workflow: ${selectedWorkflow.name || answer.workflow}`));

            return this.executeWorkflow(selectedWorkflow);

        } catch (error) {
            this.log(chalk.red(`❌ Workflow selection failed: ${error}`));
            return false;
        }
    }

    private executeWorkflow(workflow: CodeMagicWorkflow): boolean {
        try {
            // Setup environment
            this.setupEnvironment(workflow.environment);

            // Simulate instance type and build settings
            this.log(chalk.blue(`🖥️  Instance Type: ${workflow.instance_type || 'linux'}`));
            if (workflow.max_build_duration) {
                this.log(chalk.blue(`⏱️  Max Build Duration: ${workflow.max_build_duration} minutes`));
            }

            // Setup Flutter/Mobile environment
            this.setupMobileEnvironment(workflow.environment);

            // Execute scripts
            if (!this.executeScripts(workflow.scripts)) {
                this.log(chalk.red(`❌ Workflow scripts failed`));
                return false;
            }

            // Simulate artifacts collection
            this.simulateArtifacts(workflow.artifacts);

            // Simulate publishing (skip actual publishing)
            this.simulatePublishing(workflow.publishing);

            this.log(chalk.green(`✅ Workflow completed successfully`));
            return true;

        } catch (error) {
            this.log(chalk.red(`❌ Workflow execution failed: ${error}`));
            return false;
        }
    }

    private setupEnvironment(environment?: CodeMagicWorkflow['environment']): void {
        if (!environment) return;

        // Setup environment variables
        if (environment.vars) {
            Object.assign(this.environment, environment.vars);
        }

        // Add CodeMagic specific variables
        this.environment['CM_BUILD_DIR'] = this.workingDirectory;
        this.environment['CM_BUILD_OUTPUT_DIR'] = path.join(this.workingDirectory, 'build');
        this.environment['FCI_BUILD_DIR'] = this.workingDirectory;

        if (this.verbose && Object.keys(this.environment).length > 0) {
            this.log(chalk.gray(`📝 Environment variables set: ${Object.keys(this.environment).length}`));
        }
    }

    private setupMobileEnvironment(environment?: CodeMagicWorkflow['environment']): void {
        if (!environment) return;

        if (environment.flutter) {
            this.log(chalk.blue(`🎯 Flutter version: ${environment.flutter}`));
            this.environment['FLUTTER_ROOT'] = '/flutter'; // Simulated Flutter path
        }

        if (environment.xcode) {
            this.log(chalk.blue(`🍎 Xcode version: ${environment.xcode}`));
        }

        if (environment.cocoapods) {
            this.log(chalk.blue(`☕ CocoaPods version: ${environment.cocoapods}`));
        }

        if (environment.android_signing) {
            this.log(chalk.blue(`🔐 Android signing configured: ${environment.android_signing.join(', ')}`));
        }

        if (environment.ios_signing) {
            this.log(chalk.blue(`🔐 iOS signing configured`));
        }
    }

    private executeScripts(scripts: (string | ScriptStep)[]): boolean {
        this.log(chalk.blue(`📋 Found ${scripts.length} script(s) to execute`));

        for (let i = 0; i < scripts.length; i++) {
            const script = scripts[i];
            
            if (typeof script === 'string') {
                // Handle YAML anchor references
                if (script.startsWith('*')) {
                    const refName = script.substring(1);
                    const scriptDef = this.scriptDefinitions[refName];
                    if (scriptDef) {
                        this.log(chalk.cyan(`    Step ${i + 1}: ${scriptDef.name} (referenced)`));
                        if (!this.executeScriptStep(scriptDef)) {
                            return false;
                        }
                    } else {
                        this.log(chalk.yellow(`    ⚠️  Step ${i + 1}: Unknown script reference '${script}' - skipping`));
                    }
                } else {
                    // Direct script command
                    this.log(chalk.cyan(`    Step ${i + 1}: Direct script`));
                    if (!this.executeDirectScript(script)) {
                        return false;
                    }
                }
            } else {
                // Inline script object
                this.log(chalk.cyan(`    Step ${i + 1}: ${script.name}`));
                if (!this.executeScriptStep(script)) {
                    return false;
                }
            }

            this.log(chalk.green(`    ✅ Step ${i + 1} completed`));
        }

        return true;
    }

    private executeScriptStep(script: ScriptStep): boolean {
        try {
            const workingDir = script.working_directory 
                ? path.resolve(this.workingDirectory, script.working_directory)
                : this.workingDirectory;

            this.log(chalk.blue(`      🔧 Executing in ${workingDir}`));
            
            if (this.verbose) {
                this.log(chalk.gray(`      📜 Script: ${script.script}`));
            }

            return this.executeScriptContent(script.script, workingDir);

        } catch (error) {
            this.log(chalk.red(`      ❌ Script execution error: ${error}`));
            return false;
        }
    }

    private executeDirectScript(scriptContent: string): boolean {
        return this.executeScriptContent(scriptContent, this.workingDirectory);
    }

    private executeScriptContent(scriptContent: string, workingDir: string): boolean {
        try {
            // Execute the script
            const env = { ...process.env, ...this.environment };
            const options = {
                cwd: workingDir,
                env: env,
                stdio: this.verbose ? 'inherit' : 'pipe',
                encoding: 'utf8'
            } as const;

            try {
                const result = execSync(scriptContent, options);
                if (!this.verbose && result) {
                    const output = result.toString().trim();
                    if (output.length > 0) {
                        this.log(chalk.gray(`      📄 Output: ${output.length > 200 ? output.substring(0, 200) + '...' : output}`));
                    }
                }
                return true;
            } catch (error: any) {
                this.log(chalk.red(`      ❌ Script failed with exit code: ${error.status || 'unknown'}`));
                if (error.stdout) {
                    this.log(chalk.gray(`      📄 stdout: ${error.stdout.toString().trim()}`));
                }
                if (error.stderr) {
                    this.log(chalk.red(`      📄 stderr: ${error.stderr.toString().trim()}`));
                }
                return false;
            }

        } catch (error) {
            this.log(chalk.red(`      ❌ Script execution error: ${error}`));
            return false;
        }
    }

    private simulateArtifacts(artifacts?: string[]): void {
        if (!artifacts || artifacts.length === 0) return;

        this.log(chalk.blue(`📦 Simulating artifact collection:`));
        for (const artifact of artifacts) {
            this.log(chalk.blue(`      📄 ${artifact}`));
        }
    }

    private simulatePublishing(publishing?: CodeMagicWorkflow['publishing']): void {
        if (!publishing) return;

        this.log(chalk.blue(`📤 Simulating publishing:`));
        
        if (publishing.email) {
            this.log(chalk.blue(`      📧 Email notifications configured`));
        }
        
        if (publishing.google_play) {
            this.log(chalk.blue(`      🎮 Google Play Store publishing configured`));
        }
        
        if (publishing.app_store_connect) {
            this.log(chalk.blue(`      🍎 App Store Connect publishing configured`));
        }
    }

    private log(message: string): void {
        console.log(message);
    }
}