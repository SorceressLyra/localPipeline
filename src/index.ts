import commandlineArgs from 'command-line-args';
import commandLineUsage from 'command-line-usage'
import * as consoleUsage from './consoleUsage';

const mainDefs: commandlineArgs.OptionDefinition[] = [
    { name: "input", alias: "i", type: String, defaultOption: true },
    { name: "output", alias: "o", type: String},
    { name: "verbose", alias: "v", type: Boolean, defaultValue: false},
];

const mainOptions = commandlineArgs(mainDefs, { stopAtFirstUnknown: true });
const argv = mainOptions._unknown || [];


if (mainOptions.input) {
    console.log(`Input file: ${mainOptions.input}`);
}else{
    console.log(commandLineUsage(consoleUsage.sections));
}