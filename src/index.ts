import commandlineArgs from 'command-line-args';
import * as consoleUsage from './consoleUsage';

const mainDefs: commandlineArgs.OptionDefinition[] = [
    { name: "input", alias: "i", type: String, defaultOption: true },
    { name: "output", alias: "o", type: String},
    { name: "verbose", alias: "v", type: Boolean, defaultValue: false},
];

const mainOptions = commandlineArgs(mainDefs, { stopAtFirstUnknown: true });

if (mainOptions.input) {
    console.log(`Input file: ${mainOptions.input}`);
}else{
    consoleUsage.printConsoleUsage();
}