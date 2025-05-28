const fs = require('fs');
const xml2js = require('xml2js');

class XMLProcessor {
    constructor() {
        this.parserOptions = {
            explicitArray: false,
            preserveChildrenOrder: true
        };
    }

    async processFile(filePath) {
        try {
            const xmlData = this.readXMLFile(filePath);
            const parsedData = await this.parseXML(xmlData);
            const rawData = this.extractBlocks(parsedData);
            const finalData = this.processDuplicates(rawData);
            
            this.generateOutput(filePath, finalData);
        } catch (error) {
            console.error('Error processing XML:', error.message);
            console.log('Add the requested XML file "text.xml" Then Try again ... ');
            
        }
    }

    readXMLFile(filePath) {
        return fs.readFileSync(filePath, 'utf-8');
    }

    async parseXML(xmlData) {
        const parser = new xml2js.Parser(this.parserOptions);
        return await parser.parseStringPromise(xmlData);
    }

    extractBlocks(parsedData) {
        const rawData = [];
        this.processXMLBlocks(parsedData, [], rawData);
        return rawData;
    }

    processXMLBlocks(obj, path = [], rawData = []) {
        for (const key in obj) {
            if (key === 'block') {
                this.processBlock(obj[key], rawData);
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                this.processXMLBlocks(obj[key], [...path, key], rawData);
            }
        }
    }

    processBlock(blocks, rawData) {
        const normalizedBlocks = Array.isArray(blocks) ? blocks : [blocks];
        
        normalizedBlocks.forEach(block => {
            const { typeName, instanceName } = block.$ || {};
            if (!typeName || !instanceName) return;

            this.processInputVariables(block.inputVariables, typeName, instanceName, rawData);
        });
    }

    processInputVariables(inputVars, typeName, instanceName, rawData) {
        if (!inputVars?.variable) return;

        const variables = Array.isArray(inputVars.variable) 
            ? inputVars.variable 
            : [inputVars.variable];

        variables.forEach(v => {
            const formal = v.$?.formalParameter || '';
            const hasConnection = v.connectionPointIn?.connection;

            if (formal.includes('EHS') && hasConnection) {
                const failType = this.determineFailSafeType(formal);
                rawData.push({
                    InstanceName: instanceName,
                    TypeName: typeName,
                    FailSafeType: failType
                });
            }
        });
    }

    determineFailSafeType(formalParameter) {
        if (formalParameter.includes('EHSH')) return 'Normal Fail Safe';
        if (formalParameter.includes('EHSL')) return 'Reversed Fail Safe';
        return 'Unknown';
    }

    processDuplicates(rawData) {
        const instanceMap = this.groupByInstanceName(rawData);
        return this.createFinalData(instanceMap);
    }

    groupByInstanceName(rawData) {
        return rawData.reduce((acc, entry) => {
            const { InstanceName } = entry;
            acc[InstanceName] = acc[InstanceName] || [];
            acc[InstanceName].push(entry);
            return acc;
        }, {});
    }

    createFinalData(instanceMap) {
        return Object.values(instanceMap).map(entries => {
            return entries.length > 1
                ? { ...entries[0], FailSafeType: 'Complex Fail Safe' }
                : entries[0];
        });
    }

    generateOutput(filePath, finalData) {
        if (finalData.length === 0) {
            console.log('\nNo blocks found in the XML file.');
            return;
        }

        console.log('\nFinished processing. Writing to xmlout.csv...');
        this.writeToCSV(finalData);
        console.log('Output saved to xmlout.csv');
    }

    writeToCSV(data) {
        if (data.length === 0) return;

        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => this.formatCSVRow(row, headers))
        ].join('\n');

        fs.writeFileSync('xmlout.csv', csvContent, 'utf8');
    }

    formatCSVRow(row, headers) {
        return headers.map(header => {
            const value = row[header] ?? '';
            return this.escapeCSVValue(value.toString());
        }).join(',');
    }

    escapeCSVValue(value) {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }
}

// Usage
const xmlFile = process.argv[2] || 'test.xml';
const processor = new XMLProcessor();
processor.processFile(xmlFile);