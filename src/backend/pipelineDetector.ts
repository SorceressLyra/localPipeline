import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { GitHubActionsRunner } from './Implementations/githubActionsRunner';
import { AzurePipelineRunner } from './Implementations/azurePipelineRunner';
import { CodeMagicRunner } from './Implementations/codemagicRunner';
import { Pipeline } from './pipelineInterface';
import chalk from 'chalk';
import inquirer from 'inquirer';

export enum PipelineType {
    GITHUB_ACTIONS = 'github-actions',
    AZURE_DEVOPS = 'azure-devops',
    CODEMAGIC = 'codemagic',
    UNKNOWN = 'unknown'
}

export class PipelineDetector {
    private verbose: boolean = false;

    constructor(verbose: boolean = false) {
        this.verbose = verbose;
    }

    /**
     * Detect the pipeline type based on the input path (non-interactive)
     */
    detectPipelineType(inputPath: string): PipelineType {
        if (this.verbose) {
            console.log(chalk.blue(`🔍 Detecting pipeline type for: ${inputPath}`));
        }

        // Check if input path is a specific file
        if (inputPath.endsWith('.yml') || inputPath.endsWith('.yaml')) {
            return this.detectFromFile(inputPath);
        }

        // Check if input path is a directory
        if (fs.existsSync(inputPath) && fs.lstatSync(inputPath).isDirectory()) {
            return this.detectFromDirectory(inputPath);
        }

        // Check parent directory if input path doesn't exist
        const parentDir = path.dirname(inputPath);
        if (fs.existsSync(parentDir)) {
            return this.detectFromDirectory(parentDir);
        }

        return PipelineType.UNKNOWN;
    }

    /**
     * Detect the pipeline type based on the input path, with interactive selection if multiple files found
     */
    async detectPipelineTypeInteractive(inputPath: string): Promise<{type: PipelineType, path: string} | null> {
        if (this.verbose) {
            console.log(chalk.blue(`🔍 Detecting pipeline type for: ${inputPath}`));
        }

        // Check if input path is a specific file
        if (inputPath.endsWith('.yml') || inputPath.endsWith('.yaml')) {
            const type = this.detectFromFile(inputPath);
            return { type, path: inputPath };
        }

        // Check if input path is a directory
        if (fs.existsSync(inputPath) && fs.lstatSync(inputPath).isDirectory()) {
            return await this.detectFromDirectoryInteractive(inputPath);
        }

        // Check parent directory if input path doesn't exist
        const parentDir = path.dirname(inputPath);
        if (fs.existsSync(parentDir)) {
            return await this.detectFromDirectoryInteractive(parentDir);
        }

        return null;
    }

    /**
     * Detect pipeline type from a directory with interactive selection if multiple files found
     */
    private async detectFromDirectoryInteractive(dirPath: string): Promise<{type: PipelineType, path: string} | null> {
        const allFiles = this.findAllPipelineFiles(dirPath);
        
        if (allFiles.length === 0) {
            return { type: PipelineType.UNKNOWN, path: dirPath };
        }

        if (allFiles.length === 1) {
            // Only one file found, use it directly
            return allFiles[0];
        }

        // Multiple files found, prompt user to select
        console.log(chalk.yellow(`🤔 Multiple pipeline files found (${allFiles.length}). Please select one:`));
        
        try {
            const choices = allFiles.map(file => {
                const typeColor = this.getTypeColor(file.type);
                const relativePath = path.relative(dirPath, file.path);
                return {
                    name: `${typeColor(file.type.padEnd(15))} ${chalk.gray(relativePath)}`,
                    value: file,
                    short: path.basename(file.path)
                };
            });

            const answer = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'file',
                    message: 'Select a pipeline file to execute:',
                    choices: choices,
                    pageSize: 10
                }
            ]);

            return answer.file;

        } catch (error) {
            console.log(chalk.red(`❌ File selection failed: ${error}`));
            return null;
        }
    }

    getTypeColor(type: PipelineType): (text: string) => string {
        switch (type) {
            case PipelineType.GITHUB_ACTIONS:
                return chalk.green;
            case PipelineType.AZURE_DEVOPS:
                return chalk.blue;
            case PipelineType.CODEMAGIC:
                return chalk.magenta;
            default:
                return chalk.gray;
        }
    }

    /**
     * Create the appropriate pipeline runner based on the detected type
     */
    createRunner(pipelineType: PipelineType): Pipeline | null {
        switch (pipelineType) {
            case PipelineType.GITHUB_ACTIONS:
                return new GitHubActionsRunner(this.verbose);
            case PipelineType.AZURE_DEVOPS:
                return new AzurePipelineRunner(this.verbose);
            case PipelineType.CODEMAGIC:
                return new CodeMagicRunner(this.verbose);
            default:
                return null;
        }
    }

    /**
     * Detect pipeline type from a specific file
     */
    private detectFromFile(filePath: string): PipelineType {
        if (!fs.existsSync(filePath)) {
            return PipelineType.UNKNOWN;
        }

        const fileName = path.basename(filePath);
        const fileDir = path.dirname(filePath);

        // Check for GitHub Actions by file location and name
        if (filePath.includes('.github/workflows/') || 
            fileDir.endsWith('.github/workflows') ||
            fileDir.includes('.github/workflows')) {
            return PipelineType.GITHUB_ACTIONS;
        }

        // Check for Azure Pipelines by file name
        if (fileName === 'azure-pipelines.yml' || 
            fileName === 'azure-pipelines.yaml' ||
            fileName === '.azure-pipelines.yml') {
            return PipelineType.AZURE_DEVOPS;
        }

        // Check for CodeMagic by file name
        if (fileName === 'codemagic.yaml' || 
            fileName === 'codemagic.yml' ||
            fileName === '.codemagic.yaml' ||
            fileName === '.codemagic.yml') {
            return PipelineType.CODEMAGIC;
        }

        // Try to detect by file content
        return this.detectFromFileContent(filePath);
    }

    /**
     * Detect pipeline type from a directory by looking for pipeline files
     */
    private detectFromDirectory(dirPath: string): PipelineType {
        // Check for GitHub Actions workflows
        const githubWorkflowsDir = path.join(dirPath, '.github', 'workflows');
        if (fs.existsSync(githubWorkflowsDir)) {
            const workflowFiles = fs.readdirSync(githubWorkflowsDir)
                .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));
            if (workflowFiles.length > 0) {
                return PipelineType.GITHUB_ACTIONS;
            }
        }

        // Check for Azure Pipelines
        const azureFiles = [
            'azure-pipelines.yml',
            'azure-pipelines.yaml',
            '.azure-pipelines.yml'
        ];
        for (const file of azureFiles) {
            if (fs.existsSync(path.join(dirPath, file))) {
                return PipelineType.AZURE_DEVOPS;
            }
        }

        // Check for CodeMagic
        const codemagicFiles = [
            'codemagic.yaml',
            'codemagic.yml',
            '.codemagic.yaml',
            '.codemagic.yml'
        ];
        for (const file of codemagicFiles) {
            if (fs.existsSync(path.join(dirPath, file))) {
                return PipelineType.CODEMAGIC;
            }
        }

        return PipelineType.UNKNOWN;
    }

    /**
     * Detect pipeline type by analyzing file content
     */
    private detectFromFileContent(filePath: string): PipelineType {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = yaml.load(content) as any;

            if (!parsed || typeof parsed !== 'object') {
                return PipelineType.UNKNOWN;
            }

            // GitHub Actions indicators
            if (parsed.on || parsed.jobs) {
                // GitHub Actions typically has 'on' (triggers) and 'jobs'
                return PipelineType.GITHUB_ACTIONS;
            }

            // Azure DevOps indicators
            if (parsed.trigger !== undefined || 
                parsed.pr !== undefined || 
                parsed.pool || 
                parsed.stages || 
                (parsed.jobs && !parsed.on)) {
                return PipelineType.AZURE_DEVOPS;
            }

            // CodeMagic indicators
            if (parsed.workflows || 
                parsed.definitions || 
                parsed.environment?.flutter ||
                parsed.environment?.xcode ||
                parsed.environment?.android_signing) {
                return PipelineType.CODEMAGIC;
            }

            return PipelineType.UNKNOWN;

        } catch (error) {
            if (this.verbose) {
                console.log(chalk.yellow(`⚠️  Could not parse file content for detection: ${error}`));
            }
            return PipelineType.UNKNOWN;
        }
    }

    /**
     * Get a list of all pipeline files found in a directory
     */
    findAllPipelineFiles(dirPath: string): Array<{type: PipelineType, path: string}> {
        const results: Array<{type: PipelineType, path: string}> = [];

        if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) {
            return results;
        }

        // GitHub Actions
        const githubWorkflowsDir = path.join(dirPath, '.github', 'workflows');
        if (fs.existsSync(githubWorkflowsDir)) {
            const workflowFiles = fs.readdirSync(githubWorkflowsDir)
                .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'))
                .map(file => ({
                    type: PipelineType.GITHUB_ACTIONS,
                    path: path.join(githubWorkflowsDir, file)
                }));
            results.push(...workflowFiles);
        }

        // Azure DevOps
        const azureFiles = [
            'azure-pipelines.yml',
            'azure-pipelines.yaml',
            '.azure-pipelines.yml'
        ];
        for (const file of azureFiles) {
            const fullPath = path.join(dirPath, file);
            if (fs.existsSync(fullPath)) {
                results.push({
                    type: PipelineType.AZURE_DEVOPS,
                    path: fullPath
                });
            }
        }

        // CodeMagic
        const codemagicFiles = [
            'codemagic.yaml',
            'codemagic.yml',
            '.codemagic.yaml',
            '.codemagic.yml'
        ];
        for (const file of codemagicFiles) {
            const fullPath = path.join(dirPath, file);
            if (fs.existsSync(fullPath)) {
                results.push({
                    type: PipelineType.CODEMAGIC,
                    path: fullPath
                });
            }
        }

        return results;
    }
}
