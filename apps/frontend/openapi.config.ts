import type { GeneratorConfig } from 'ng-openapi';

const config: GeneratorConfig = {
  input: 'http://localhost:3000/api/docs-json',
  output: './src/app/api/generated',
  options: {
    generateServices: false,
    modelFileStructure: 'per-type',
    dateType: 'string',
    enumStyle: 'union',
  },
};

export default config;
