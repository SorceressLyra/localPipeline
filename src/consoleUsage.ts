import chalk from "chalk";
import commandLineUsage from 'command-line-usage'
import { version, description } from '../package.json';



const header =
`
██╗      ██████╗  ██████╗ █████╗ ██╗     ██████╗ ██╗██████╗ ███████╗
██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██╔══██╗██║██╔══██╗██╔════╝
██║     ██║   ██║██║     ███████║██║     ██████╔╝██║██████╔╝█████╗  
██║     ██║   ██║██║     ██╔══██║██║     ██╔═══╝ ██║██╔═══╝ ██╔══╝  
███████╗╚██████╔╝╚██████╗██║  ██║███████╗██║     ██║██║     ███████╗
╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝     ╚══════╝ 
`

const sections = [
    {
        content: chalk.magenta(header),
        raw: true
    },
    {
        header: chalk.magenta("LocalPipe"),
        content:
        `
        ${description}
        Compatible with {bold GitHub Actions, Azure Pipelines & CodeMagic}
        
        Version: {bold ${version}}
        `
    },
    {
        header: chalk.magenta("Usage"),
        content: [
            "$ localpipe --input {underline path} [--output {underline path}] [--verbose] [--type {underline type}] [--workflow {underline name}]",
            "$ localpipe -i {underline path} [-o {underline path}] [-v] [-t {underline type}] [-w {underline name}]",
            "$ localpipe --list {underline directory} [--verbose]",
            "$ localpipe -l {underline directory} [-v]",
            "$ localpipe --list-workflows {underline path} [--type {underline type}]"
        ]
    },
    {
        header: chalk.magenta("Options"),
        optionList: [
            {
                name: "input",
                alias: "i",
                type: String,
                typeLabel: "{underline path}",
                description: "Path to the pipeline file or project directory. Interactive selection when multiple files/workflows found. ({italic required})",
            },
            {
                name: "output",
                alias: "o",
                type: String,
                typeLabel: "{underline path}",
                description: "Path to the output directory (optional)."
            },
            {
                name: "verbose",
                alias: "v",
                type: Boolean,
                typeLabel: "",
                description: "Enable verbose output with detailed logs."
            },
            {
                name: "type",
                alias: "t",
                type: String,
                typeLabel: "{underline type}",
                description: "Force pipeline type: github-actions, azure-devops, or codemagic."
            },
            {
                name: "workflow",
                alias: "w",
                type: String,
                typeLabel: "{underline name}",
                description: "Select specific workflow to run (useful for multi-workflow files)."
            },
            {
                name: "list",
                alias: "l",
                type: Boolean,
                typeLabel: "",
                description: "List all pipeline files found in the directory."
            },
            {
                name: "list-workflows",
                type: Boolean,
                typeLabel: "",
                description: "List all workflows in the specified pipeline file."
            }
        ]
    },
    {
        content: "Project Home: {underline https://github.com/SorceressLyra/localPipeline}"
    }
];

export function printConsoleUsage() {
    console.log(commandLineUsage(sections));
}