import chalk from "chalk";


const header =
`
██╗      ██████╗  ██████╗ █████╗ ██╗     ██████╗ ██╗██████╗ ███████╗
██║     ██╔═══██╗██╔════╝██╔══██╗██║     ██╔══██╗██║██╔══██╗██╔════╝
██║     ██║   ██║██║     ███████║██║     ██████╔╝██║██████╔╝█████╗  
██║     ██║   ██║██║     ██╔══██║██║     ██╔═══╝ ██║██╔═══╝ ██╔══╝  
███████╗╚██████╔╝╚██████╗██║  ██║███████╗██║     ██║██║     ███████╗
╚══════╝ ╚═════╝  ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝     ╚══════╝ 
`

export const sections = [
    {
        content: chalk.magenta(header),
        raw: true
    },
    {
        header: chalk.magenta("LocalPipe"),
        content: "Command-line interface for testing and running local pipelines. \n Compatible with {bold Azure Pipelines & CodeMagic}"
    },
    {
        header: chalk.magenta("Usage"),
        content: [
            "$ localpipe --input {underline path} [--output {underline path}] [--verbose]",
            "$ localpipe -i {underline path} [-o {underline path}] [-v]"
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
                description: "Path to the input file. ({italic required})",
            },
            {
                name: "output",
                alias: "o",
                type: String,
                typeLabel: "{underline path}",
                description: "Path to the output file."
            },
            {
                name: "verbose",
                alias: "v",
                type: Boolean,
                typeLabel: "",
                description: "Enable verbose output."
            }
        ]
    },
    {
        content: "Project Home: {underline https://github.com/your-repo}"
    }
];