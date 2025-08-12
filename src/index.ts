#!/usr/bin/env node

import commandlineArgs from 'command-line-args';
import * as consoleUsage from './consoleUsage';
import { PipelineDetector, PipelineType } from './backend/pipelineDetector';
import chalk from 'chalk';
import * as path from 'path';

const mainDefs: commandlineArgs.OptionDefinition[] = [
    { name: "input", alias: "i", type: String, defaultOption: true },
    { name: "output", alias: "o", type: String},
    { name: "verbose", alias: "v", type: Boolean, defaultValue: false},
    { name: "type", alias: "t", type: String},
    { name: "list", alias: "l", type: Boolean, defaultValue: false},
    { name: "workflow", alias: "w", type: String},
    { name: "list-workflows", type: Boolean, defaultValue: false},
];

const mainOptions = commandlineArgs(mainDefs, { stopAtFirstUnknown: true });

async function main() {
    if (!mainOptions.input) {
        consoleUsage.printConsoleUsage();
        return;
    }

    const detector = new PipelineDetector(mainOptions.verbose);
    
    // If list flag is provided, list all pipeline files
    if (mainOptions.list) {
        listPipelineFiles(detector, mainOptions.input);
        return;
    }

    // If list-workflows flag is provided, list workflows in the pipeline
    if (mainOptions['list-workflows']) {
        listWorkflows(detector, mainOptions.input, mainOptions.type);
        return;
    }

    // Determine pipeline type and file path
    let pipelineType: PipelineType;
    let actualInputPath: string = mainOptions.input;
    
    if (mainOptions.type) {
        // User specified the pipeline type
        pipelineType = mainOptions.type.toLowerCase() as PipelineType;
        if (!Object.values(PipelineType).includes(pipelineType)) {
            console.log(chalk.red(`❌ Unsupported pipeline type: ${mainOptions.type}`));
            console.log(chalk.blue(`Supported types: ${Object.values(PipelineType).filter(t => t !== PipelineType.UNKNOWN).join(', ')}`));
            return;
        }
    } else {
        // Auto-detect pipeline type with interactive selection if multiple files found
        const detection = await detector.detectPipelineTypeInteractive(mainOptions.input);
        if (!detection) {
            console.log(chalk.red('❌ Could not detect pipeline type'));
            console.log(chalk.yellow('💡 Try specifying the type explicitly with --type flag'));
            console.log(chalk.blue(`Supported types: ${Object.values(PipelineType).filter(t => t !== PipelineType.UNKNOWN).join(', ')}`));
            return;
        }
        pipelineType = detection.type;
        actualInputPath = detection.path;
    }

    if (pipelineType === PipelineType.UNKNOWN) {
        console.log(chalk.red('❌ Could not detect pipeline type'));
        console.log(chalk.yellow('💡 Try specifying the type explicitly with --type flag'));
        console.log(chalk.blue(`Supported types: ${Object.values(PipelineType).filter(t => t !== PipelineType.UNKNOWN).join(', ')}`));
        return;
    }

    console.log(chalk.blue(`🔍 Pipeline type: ${pipelineType}`));

    // Create and execute pipeline runner
    const runner = detector.createRunner(pipelineType);
    if (!runner) {
        console.log(chalk.red(`❌ Could not create runner for pipeline type: ${pipelineType}`));
        return;
    }

    console.log(chalk.green(`🚀 Starting LocalPipe execution...`));
    console.log(chalk.blue(`📁 Input: ${path.resolve(actualInputPath)}`));
    
    if (mainOptions.output) {
        console.log(chalk.blue(`📤 Output: ${path.resolve(mainOptions.output)}`));
    }

    if (mainOptions.workflow) {
        console.log(chalk.blue(`🎯 Target workflow: ${mainOptions.workflow}`));
    }

    const startTime = Date.now();
    
    try {
        const result = await runner.execute(actualInputPath, mainOptions.workflow);
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        if (result) {
            console.log(chalk.green(`\n🎉 Pipeline completed successfully in ${duration}s`));
        } else {
            console.log(chalk.red(`\n❌ Pipeline failed after ${duration}s`));
            process.exit(1);
        }
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(chalk.red(`\n💥 Pipeline crashed after ${duration}s: ${error}`));
        process.exit(1);
    }
}

function listWorkflows(detector: PipelineDetector, inputPath: string, specifiedType?: string) {
    console.log(chalk.blue(`🔍 Searching for workflows in: ${path.resolve(inputPath)}`));
    
    // Determine pipeline type
    let pipelineType: PipelineType;
    
    if (specifiedType) {
        pipelineType = specifiedType.toLowerCase() as PipelineType;
        if (!Object.values(PipelineType).includes(pipelineType)) {
            console.log(chalk.red(`❌ Unsupported pipeline type: ${specifiedType}`));
            return;
        }
    } else {
        pipelineType = detector.detectPipelineType(inputPath);
    }

    if (pipelineType === PipelineType.UNKNOWN) {
        console.log(chalk.red('❌ Could not detect pipeline type'));
        console.log(chalk.yellow('💡 Try specifying the type explicitly with --type flag'));
        return;
    }

    // Create runner and list workflows
    const runner = detector.createRunner(pipelineType);
    if (!runner || !runner.listWorkflows) {
        console.log(chalk.red(`❌ Could not create runner or runner doesn't support listing workflows`));
        return;
    }

    const workflows = runner.listWorkflows(inputPath);
    
    if (workflows.length === 0) {
        console.log(chalk.yellow('⚠️  No workflows found'));
        return;
    }

    console.log(chalk.green(`\n📋 Found ${workflows.length} workflow(s) in ${pipelineType}:`));
    
    workflows.forEach((workflow, index) => {
        const typeColor = detector.getTypeColor(pipelineType);
        console.log(`${index + 1}. ${typeColor(workflow)}`);
    });

    console.log(chalk.blue('\n💡 Run with a specific workflow: localpipe --input <path> --workflow <workflow-name>'));
}

function listPipelineFiles(detector: PipelineDetector, inputPath: string) {
    console.log(chalk.blue(`🔍 Searching for pipeline files in: ${path.resolve(inputPath)}`));
    
    const files = detector.findAllPipelineFiles(inputPath);
    
    if (files.length === 0) {
        console.log(chalk.yellow('⚠️  No pipeline files found'));
        return;
    }

    console.log(chalk.green(`\n📋 Found ${files.length} pipeline file(s):`));
    
    files.forEach((file, index) => {
        const typeColor = detector.getTypeColor(file.type);
        console.log(`${index + 1}. ${typeColor(file.type.padEnd(15))} ${chalk.gray(file.path)}`);
    });

    console.log(chalk.blue('\n💡 Run with a specific file: localpipe --input <file-path>'));
}

// Run the main function
main().catch(error => {
    console.error(chalk.red(`💥 Unexpected error: ${error}`));
    process.exit(1);
});