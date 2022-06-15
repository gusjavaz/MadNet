import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BytesLike, ContractFactory, ethers } from "ethers";
import {
  Artifacts,
  HardhatRuntimeEnvironment,
  RunTaskFunction,
} from "hardhat/types";
import {
  AliceNetFactory,
  AliceNetFactory__factory,
} from "../../../typechain-types";
import {
  DEFAULT_CONFIG_OUTPUT_DIR,
  DEPLOY_CREATE,
  DEPLOY_PROXY,
  DEPLOY_STATIC,
  DEPLOY_TEMPLATE,
  INITIALIZER,
  ONLY_PROXY,
  STATIC_DEPLOYMENT,
  UPGRADEABLE_DEPLOYMENT,
  UPGRADE_PROXY,
} from "../constants";
import { readDeploymentArgs } from "./deploymentConfigUtil";
import { ProxyData } from "./factoryStateUtil";

type Ethers = typeof import("../../../node_modules/ethers/lib/ethers") &
  HardhatEthersHelpers;

export interface ArgData {
  [key: string]: string;
}
export interface ContractArgs {
  [key: string]: Array<ArgData>;
}
export interface DeploymentArgs {
  constructor: ContractArgs;
  initializer: ContractArgs;
}

export type DeployProxyMCArgs = {
  contractName: string;
  logicAddress: string;
  factoryAddress?: string;
  initCallData?: BytesLike;
  outputFolder?: string;
};

export type DeployArgs = {
  contractName: string;
  factoryAddress: string;
  initCallData?: string;
  constructorArgs?: any;
  outputFolder?: string;
  deploymentListRecord?: string;
};

export type Args = {
  contractName: string;
  factoryAddress?: string;
  salt?: BytesLike;
  initCallData?: string;
  constructorArgs?: any;
  outputFolder?: string;
};
export interface InitData {
  constructorArgs: { [key: string]: any };
  initializerArgs: { [key: string]: any };
}

export interface ContractDescriptor {
  name: string;
  fullyQualifiedName: string;
  deployGroup: string;
  deployGroupIndex: number;
  deployType: string;
  hasConstructorArgs: boolean;
  constructorArgs: [];
  isInitializable: boolean;
  initializerArgs: [];
}

// function to deploy the factory
export async function deployFactory(run: RunTaskFunction, usrPath?: string) {
  return await run("deployFactory", { outputFolder: usrPath });
}

export async function getDeployMetaArgs(
  fullyQualifiedName: string,
  factoryAddress: string,
  artifacts: Artifacts,
  inputFolder?: string,
  outputFolder?: string
): Promise<DeployArgs> {
  let initCallData;
  // check if contract needs to be initialized
  const initAble = await isInitializable(fullyQualifiedName, artifacts);
  if (initAble) {
    const initializerArgs = await getDeploymentInitializerArgs(
      fullyQualifiedName,
      inputFolder
    );
    initCallData = await getEncodedInitCallData(initializerArgs);
  }
  const hasConArgs = await hasConstructorArgs(fullyQualifiedName, artifacts);
  const constructorArgs = hasConArgs
    ? await getDeploymentConstructorArgs(fullyQualifiedName, inputFolder)
    : undefined;
  return {
    contractName: extractName(fullyQualifiedName),
    factoryAddress: factoryAddress,
    initCallData: initCallData,
    constructorArgs: constructorArgs,
    outputFolder: outputFolder,
  };
}

export async function getDeployMetaArgs2(
  contract: ContractDescriptor,
  factoryAddress: string,
  artifacts: Artifacts,
  inputFolder?: string,
  outputFolder?: string
): Promise<DeployArgs> {
  let initCallData;
  // check if contract needs to be initialized
  const initAble = contract.initializerArgs;
  const constructorArgs = contract.constructorArgs;
  return {
    contractName: contract.name,
    factoryAddress: factoryAddress,
    initCallData: initCallData,
    constructorArgs: constructorArgs,
    outputFolder: outputFolder,
    // deploymentListRecord: contract,
  };
}

export async function getDeployMetaArgs3(
  deploymentListRecord: string,
  factoryAddress: string,
  artifacts: Artifacts,
  inputFolder?: string,
  outputFolder?: string
): Promise<DeployArgs> {
  let initCallData;
  // check if contract needs to be initialized
  const initAble = await isInitializableFromDeploymentListRecord(
    deploymentListRecord
  );
  if (initAble) {
    const initializerArgs = await getDeploymentInitializerArgs(
      deploymentListRecord.split(":")[0] +
        ":" +
        deploymentListRecord.split(":")[1],
      inputFolder
    );
    initCallData = await getEncodedInitCallData(initializerArgs);
  }
  const hasConArgs = await hasConstructorArgsFromDeploymentListRecord(
    deploymentListRecord
  );
  const constructorArgs = hasConArgs
    ? await getDeploymentConstructorArgs(
        deploymentListRecord.split(":")[0] +
          ":" +
          deploymentListRecord.split(":")[1],
        inputFolder
      )
    : undefined;
  return {
    contractName: extractName(deploymentListRecord),
    factoryAddress: factoryAddress,
    initCallData: initCallData,
    constructorArgs: constructorArgs,
    outputFolder: outputFolder,
    deploymentListRecord: deploymentListRecord,
  };
}

export async function getDeployStaticMultiCallArgs(
  contractDescriptor: ContractDescriptor,
  hre: HardhatRuntimeEnvironment,
  factoryBase: AliceNetFactory__factory,
  factory: AliceNetFactory,
  txCount: number
) {
  const logicContract: ContractFactory = await hre.ethers.getContractFactory(
    contractDescriptor.name
  );
  const logicFactory = await hre.ethers.getContractFactory(
    contractDescriptor.name
  );
  const deployTxReq = logicContract.getDeployTransaction(
    ...contractDescriptor.constructorArgs
  );
  let initCallData = "0x";
  if (contractDescriptor.initializerArgs.length > 0)
    initCallData = logicFactory.interface.encodeFunctionData(
      INITIALIZER,
      contractDescriptor.initializerArgs
    );
  const salt = ethers.utils.formatBytes32String(contractDescriptor.name);
  const deployTemplate: BytesLike = factoryBase.interface.encodeFunctionData(
    DEPLOY_TEMPLATE,
    [deployTxReq.data]
  );
  const deployStatic: BytesLike = factoryBase.interface.encodeFunctionData(
    DEPLOY_STATIC,
    [salt, initCallData]
  );
  return [deployTemplate, deployStatic];
}

export async function getDeployUpgradeableMultiCallArgs(
  contractDescriptor: ContractDescriptor,
  hre: HardhatRuntimeEnvironment,
  factoryBase: AliceNetFactory__factory,
  factory: AliceNetFactory,
  txCount: number
) {
  const logicContract: ContractFactory = await hre.ethers.getContractFactory(
    contractDescriptor.name
  );
  const logicFactory = await hre.ethers.getContractFactory(
    contractDescriptor.name
  );
  const deployTxReq = logicContract.getDeployTransaction(
    ...contractDescriptor.constructorArgs
  );
  const functions = JSON.parse(
    JSON.stringify(logicFactory.interface.functions)
  );
  let initCallData = "0x";
  if (contractDescriptor.initializerArgs.length > 0)
    initCallData = logicFactory.interface.encodeFunctionData(
      INITIALIZER,
      contractDescriptor.initializerArgs
    );
  const salt = ethers.utils.formatBytes32String(contractDescriptor.name);
  const logicAddress = hre.ethers.utils.getContractAddress({
    from: factory.address,
    nonce: txCount,
  });

  // encode deploy create
  const deployCreate: BytesLike = factoryBase.interface.encodeFunctionData(
    DEPLOY_CREATE,
    [deployTxReq.data]
  );
  // encode the deployProxy function call with Salt as arg
  const deployProxy: BytesLike = factoryBase.interface.encodeFunctionData(
    DEPLOY_PROXY,
    [salt]
  );
  // encode upgrade proxy multicall
  const upgradeProxy: BytesLike = factoryBase.interface.encodeFunctionData(
    UPGRADE_PROXY,
    [salt, logicAddress, initCallData]
  );
  const multiCallArgs = [deployCreate, deployProxy, upgradeProxy];
  return multiCallArgs;
}

export async function getMulticallArgs(
  contracts: ContractDescriptor[],
  hre: HardhatRuntimeEnvironment,
  factoryBase: AliceNetFactory__factory,
  factory: AliceNetFactory,
  txCount: number,
  deployGroup: string,
  deployIndexes: number[],
  inputFolder?: string,
  outputFolder?: string
) {
  let proxyData: ProxyData;
  let multiCallArgsArray = Array();

  for (let i = 0; i < contracts.length; i++) {
    const contract = contracts[i];
    if (
      contract.deployGroup == deployGroup &&
      deployIndexes
        .toString()
        .includes(Number(contract.deployGroupIndex).toString())
    ) {
      const deployType = contract.deployType;
      switch (deployType) {
        case STATIC_DEPLOYMENT: {
          let [deployTemplate, deployStatic] =
            await getDeployStaticMultiCallArgs(
              contract,
              hre,
              factoryBase,
              factory,
              txCount
            );
          multiCallArgsArray.push(deployTemplate);
          multiCallArgsArray.push(deployStatic);
          txCount = txCount + 2;
          break;
        }
        case UPGRADEABLE_DEPLOYMENT: {
          let [deployCreate, deployProxy, upgradeProxy] =
            await getDeployUpgradeableMultiCallArgs(
              contract,
              hre,
              factoryBase,
              factory,
              txCount
            );
          multiCallArgsArray.push(deployCreate);
          multiCallArgsArray.push(deployProxy);
          multiCallArgsArray.push(upgradeProxy);
          txCount = txCount + 2;
          break;
        }
        case ONLY_PROXY: {
          const name = extractName(contract.fullyQualifiedName);
          const salt: BytesLike = await getBytes32Salt(
            name,
            hre.artifacts,
            hre.ethers
          );
          const factoryAddress = factory.address;
          proxyData = await hre.run("deployProxy", {
            factoryAddress,
            salt,
          });
          break;
        }
        default: {
          break;
        }
      }
    }
  }
  return multiCallArgsArray;
}

export async function isInitializable(
  fullyQualifiedName: string,
  artifacts: Artifacts
) {
  const buildInfo: any = await artifacts.getBuildInfo(
    fullyQualifiedName.split(":")[0] + ":" + fullyQualifiedName.split(":")[1]
  );
  const path = extractPath(fullyQualifiedName);
  const name = extractName(fullyQualifiedName);
  const methods = buildInfo.output.contracts[path][name].abi;
  for (const method of methods) {
    if (method.name === INITIALIZER) {
      return true;
    }
  }
  return false;
}

/**
 * @description same as isInitializable but querying data from deploymentList file record and not from build-info json files (more performant)
 * @param deploymentListRecord deploymentList contract line
 * @returns true if contract has initialize method
 */
export async function isInitializableFromDeploymentListRecord(
  deploymentListRecord: string
) {
  switch (deploymentListRecord.split(":")[3]) {
    case "initializableFalse":
      return false;
    case "initializableTrue":
      return true;
  }
}

export async function hasConstructorArgs(
  fullyQualifiedName: string,
  artifacts: Artifacts
) {
  const buildInfo: any = await artifacts.getBuildInfo(
    fullyQualifiedName.split(":")[0] + ":" + fullyQualifiedName.split(":")[1]
  );
  const path = extractPath(fullyQualifiedName);
  const name = extractName(fullyQualifiedName);
  const methods = buildInfo.output.contracts[path][name].abi;
  for (const method of methods) {
    if (method.type === "constructor") {
      return method.inputs.length > 0;
    }
  }
  return false;
}

/**
 * @description same as hasConstructorArgs but querying from deploymentList file record and not from build-info json files (more performant)
 * @param deploymentListRecord deploymentList contract line
 * @returns true if contract has constructor with arguments
 */
export async function hasConstructorArgsFromDeploymentListRecord(
  deploymentListRecord: string
) {
  switch (deploymentListRecord.split(":")[4]) {
    case "hasConstructorArgsFalse":
      return false;
    case "hasConstructorArgsTrue":
      return true;
  }
}

/**
 * @description encodes init call state input to be used by the custom hardhat tasks
 * @param args values of the init call state as an array of strings where each string represents variable value
 * @returns the args array as a comma delimited string
 */
export async function getEncodedInitCallData(
  args: Array<string> | undefined
): Promise<string | undefined> {
  if (args !== undefined) {
    return args.toString();
  }
}

export async function getContract(name: string, artifacts: Artifacts) {
  const artifactPaths = await artifacts.getAllFullyQualifiedNames();
  for (let i = 0; i < artifactPaths.length; i++) {
    if (artifactPaths[i].split(":")[1] === name) {
      return String(artifactPaths[i]);
    }
  }
}

export async function getAllContracts(artifacts: Artifacts) {
  // get a list with all the contract names
  return await artifacts.getAllFullyQualifiedNames();
}

export function extractPath(fullName: string) {
  return fullName.split(":")[0];
}

export function extractName(fullName: string) {
  return fullName.split(":")[1];
}

export async function getCustomNSTag(
  fullyQaulifiedContractName: string,
  tagName: string,
  artifacts: Artifacts
): Promise<string> {
  const buildInfo = await artifacts.getBuildInfo(fullyQaulifiedContractName);
  if (buildInfo !== undefined) {
    const name = extractName(fullyQaulifiedContractName);
    const path = extractPath(fullyQaulifiedContractName);
    const info: any = buildInfo?.output.contracts[path][name];
    return info.devdoc[`custom:${tagName}`];
  } else {
    throw new Error(`Failed to get natspec tag ${tagName}`);
  }
}

// return a list of constructor inputs for each contract
export async function getDeploymentConstructorArgs(
  fullyQualifiedName: string,
  configDirPath?: string
) {
  let output: Array<string> = [];
  // get the deployment args
  const path =
    configDirPath === undefined
      ? DEFAULT_CONFIG_OUTPUT_DIR + "/deploymentArgsTemplate"
      : configDirPath + "/deploymentArgsTemplate";
  const deploymentConfig: any = await readDeploymentArgs(path);
  if (deploymentConfig !== undefined) {
    const deploymentArgs: DeploymentArgs = {
      constructor: deploymentConfig.constructor,
      initializer: deploymentConfig.initializer,
    };
    if (
      deploymentArgs.constructor !== undefined &&
      deploymentArgs.constructor[fullyQualifiedName] !== undefined
    ) {
      output = extractArgs(deploymentArgs.constructor[fullyQualifiedName]);
    }
  } else {
    output = [];
  }
  return output;
}

export function extractArgs(input: Array<ArgData>) {
  const output: Array<string> = [];
  for (let i = 0; i < input.length; i++) {
    const argName = Object.keys(input[i])[0];
    const argData = input[i];
    output.push(argData[argName]);
  }
  return output;
}

// return a list of initializer inputs for each contract
export async function getDeploymentInitializerArgs(
  fullyQualifiedName: string,
  configDirPath?: string
) {
  let output: Array<string> | undefined;
  const path =
    configDirPath === undefined
      ? DEFAULT_CONFIG_OUTPUT_DIR + "/deploymentArgsTemplate"
      : configDirPath + "/deploymentArgsTemplate";
  const deploymentConfig: any = await readDeploymentArgs(path);
  if (deploymentConfig !== undefined) {
    const deploymentArgs: DeploymentArgs = deploymentConfig;
    if (
      deploymentArgs.initializer !== undefined &&
      deploymentArgs.initializer[fullyQualifiedName] !== undefined
    ) {
      output = extractArgs(deploymentArgs.initializer[fullyQualifiedName]);
    }
  } else {
    output = undefined;
  }
  return output;
}

export function getFullQualifiedNameFromDeploymentListRecord(
  deploymentListRecord: string
) {
  return (
    deploymentListRecord.split(":")[0] +
    ":" +
    deploymentListRecord.split(":")[1]
  );
}

export async function getSalt(fullName: string, artifacts: Artifacts) {
  return await getCustomNSTag(fullName, "salt", artifacts);
}

/**
 * @description same as getSalt but querying from deploymentList file record and not from build-info json files (more performant)
 * @param deploymentListRecord deploymentList contract line
 * @returns the salt read from file
 */
export async function getSaltFromDeploymentListRecord(
  deploymentListRecord: string
) {
  return ethers.utils.formatBytes32String(deploymentListRecord.split(":")[1]);
}

export async function getBytes32Salt(
  contractName: string,
  artifacts: Artifacts,
  ethers: Ethers
) {
  const fullName = await getFullyQualifiedName(contractName, artifacts);
  const salt: string = await getSalt(fullName, artifacts);
  return ethers.utils.formatBytes32String(salt);
}

export async function getFullyQualifiedName(
  contractName: string,
  artifacts: Artifacts
) {
  const contractArtifact = await artifacts.readArtifact(contractName);
  const path = contractArtifact.sourceName;
  return path + ":" + contractName;
}

export async function getDeployTypeFromDeploymentListRecord(
  deploymentListRecord: string
) {
  return deploymentListRecord.split(":")[2];
}

export async function getDeployType(fullName: string, artifacts: Artifacts) {
  return await getCustomNSTag(fullName, "deploy-type", artifacts);
}

export async function getDeployGroup(fullName: string, artifacts: Artifacts) {
  fullName = getFullQualifiedNameFromDeploymentListRecord(fullName);
  return await getCustomNSTag(fullName, "deploy-group", artifacts);
}

export async function getDeployGroupIndex(
  fullName: string,
  artifacts: Artifacts
) {
  fullName = getFullQualifiedNameFromDeploymentListRecord(fullName);
  return await getCustomNSTag(fullName, "deploy-group-index", artifacts);
}
