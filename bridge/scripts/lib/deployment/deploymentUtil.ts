import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumber, BytesLike, ContractFactory } from "ethers";
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
  type?: "upgradeable" | "static" | undefined;
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

export async function getDeployUpgradeableProxyArgs(
  fullyQualifiedName: string,
  factoryAddress: string,
  artifacts: Artifacts,
  inputFolder?: string,
  outputFolder?: string
): Promise<DeployArgs> {
  let initCallData;
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

export async function getDeployStaticMultiCallArgs(
  deployArgs: DeployArgs,
  hre: HardhatRuntimeEnvironment,
  factoryBase: AliceNetFactory__factory,
  factory: AliceNetFactory,
  txCount: number
) {
  const network = hre.network.name;
  if (network === "hardhat") {
    // hardhat is not being able to estimate correctly the tx gas due to the massive bytes array
    // being sent as input to the function (the contract bytecode), so we need to increase the block
    // gas limit temporally in order to deploy the template
    await hre.network.provider.send("evm_setBlockGasLimit", [
      "0x3000000000000000",
    ]);
  }
  const logicContract: ContractFactory = await hre.ethers.getContractFactory(
    deployArgs.contractName
  );
  const constructorArgs =
    deployArgs.constructorArgs === undefined ? [] : deployArgs.constructorArgs;
  const deployTxReq = logicContract.getDeployTransaction(...constructorArgs);

  const logicFactory = await hre.ethers.getContractFactory(
    deployArgs.contractName
  );
  const initArgs =
    deployArgs.initCallData === undefined
      ? []
      : deployArgs.initCallData.replace(/\s+/g, "").split(",");
  const fullname = (await getFullyQualifiedName(
    deployArgs.contractName,
    hre.artifacts
  )) as string;
  const isInitable = await isInitializable(fullname, hre.artifacts);
  const initCallData = isInitable
    ? logicFactory.interface.encodeFunctionData(INITIALIZER, initArgs)
    : "0x";
  const salt = await getBytes32Salt(
    deployArgs.contractName,
    hre.artifacts,
    hre.ethers
  );
  // const txCount = await hre.ethers.provider.getTransactionCount(
  //   factory.address
  // );
  const templateAddress = hre.ethers.utils.getContractAddress({
    from: factory.address,
    nonce: txCount,
  });
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
  deployArgs: DeployArgs,
  hre: HardhatRuntimeEnvironment,
  factoryBase: AliceNetFactory__factory,
  factory: AliceNetFactory,
  txCount: number
) {
  const network = hre.network.name;
  const logicFactory = await hre.ethers.getContractFactory(
    deployArgs.contractName
  );
  const initArgs =
    deployArgs.initCallData === undefined
      ? []
      : deployArgs.initCallData.replace(/\s+/g, "").split(",");
  const fullname = (await getFullyQualifiedName(
    deployArgs.contractName,
    hre.artifacts
  )) as string;
  const isInitable = await isInitializable(fullname, hre.artifacts);
  const initCallData = isInitable
    ? logicFactory.interface.encodeFunctionData(INITIALIZER, initArgs)
    : "0x";
  // factory interface pointed to deployed factory contract
  // get the 32byte salt from logic contract file
  const salt: BytesLike = await getBytes32Salt(
    deployArgs.contractName,
    hre.artifacts,
    hre.ethers
  );
  const logicContract: ContractFactory = await hre.ethers.getContractFactory(
    deployArgs.contractName
  );
  const constructorArgs =
    deployArgs.constructorArgs === undefined ? [] : deployArgs.constructorArgs;
  // encode deployBcode
  const deployTx = logicContract.getDeployTransaction(...constructorArgs);
  if (hre.network.name === "hardhat") {
    // hardhat is not being able to estimate correctly the tx gas due to the massive bytes array
    // being sent as input to the function (the contract bytecode), so we need to increase the block
    // gas limit temporally in order to deploy the template
    await hre.network.provider.send("evm_setBlockGasLimit", [
      "0x3000000000000000",
    ]);
  }
  // const txCount = await hre.ethers.provider.getTransactionCount(
  //   factory.address
  // );
  const logicAddress = hre.ethers.utils.getContractAddress({
    from: factory.address,
    nonce: txCount,
  });
  // encode deploy create
  const deployCreate: BytesLike = factoryBase.interface.encodeFunctionData(
    DEPLOY_CREATE,
    [deployTx.data]
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

export async function getContractsDeploymentMulticallArgs(
  contracts: string[],
  hre: HardhatRuntimeEnvironment,
  factoryBase: AliceNetFactory__factory,
  factory: AliceNetFactory,
  txCount: number,
  inputFolder?: string,
  outputFolder?: string
) {
  let proxyData: ProxyData;
  let multiCallArgsArray = Array();
  let cumulativeGasUsed = BigNumber.from("0");
  let t = Date.now();
  console.log("Start", Date.now() - t);
  for (let i = 0; i < contracts.length; i++) {
    const fullyQualifiedName = contracts[i];
    // check the contract for the @custom:deploy-type tag
    const deployType = await getDeployType(fullyQualifiedName, hre.artifacts);
    console.log("deployType", Date.now() - t, (t = Date.now()));
    console.log("Processing contract", fullyQualifiedName, deployType);
    switch (deployType) {
      case STATIC_DEPLOYMENT: {
        const deployArgs = await getDeployMetaArgs(
          fullyQualifiedName,
          factory.address,
          hre.artifacts,
          inputFolder,
          outputFolder
        );
        console.log("deployStaticArgs", Date.now() - t, (t = Date.now()));
        let [deployTemplate, deployStatic] = await getDeployStaticMultiCallArgs(
          deployArgs,
          hre,
          factoryBase,
          factory,
          txCount
        );
        multiCallArgsArray.push(deployTemplate);
        multiCallArgsArray.push(deployStatic);
        txCount = txCount + 2;
        console.log(
          "deployStaticMulticallArgs",
          Date.now() - t,
          (t = Date.now())
        );
        break;
      }
      case UPGRADEABLE_DEPLOYMENT: {
        let argsArray = Array();
        const deployArgs = await getDeployUpgradeableProxyArgs(
          fullyQualifiedName,
          factory.address,
          hre.artifacts,
          outputFolder
        );
        console.log("deployUpgradeableArgs", Date.now() - t, (t = Date.now()));

        let [deployCreate, deployProxy, upgradeProxy] =
          await getDeployUpgradeableMultiCallArgs(
            deployArgs,
            hre,
            factoryBase,
            factory,
            txCount
          );
        console.log(
          "deployUpgradeableMulticallArgs",
          Date.now() - t,
          (t = Date.now())
        );
        const estimatedGas = await factory.estimateGas.multiCall(argsArray);
        cumulativeGasUsed = cumulativeGasUsed.add(estimatedGas);
        console.log("estimatedGas", estimatedGas);
        multiCallArgsArray.push(deployCreate);
        multiCallArgsArray.push(deployProxy);
        multiCallArgsArray.push(upgradeProxy);
        txCount = txCount + 2;
        break;
      }
      case ONLY_PROXY: {
        const name = extractName(fullyQualifiedName);
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
        cumulativeGasUsed = cumulativeGasUsed.add(proxyData.gas);
        break;
      }
      default: {
        break;
      }
    }
  }
  return multiCallArgsArray;
}

export async function isInitializable(
  fullyQualifiedName: string,
  artifacts: Artifacts
) {
  const buildInfo: any = await artifacts.getBuildInfo(fullyQualifiedName);
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

export async function hasConstructorArgs(
  fullName: string,
  artifacts: Artifacts
) {
  const buildInfo: any = await artifacts.getBuildInfo(fullName);
  const path = extractPath(fullName);
  const name = extractName(fullName);
  const methods = buildInfo.output.contracts[path][name].abi;
  for (const method of methods) {
    if (method.type === "constructor") {
      return method.inputs.length > 0;
    }
  }
  return false;
}
/**
 * @description encodes init call data input to be used by the custom hardhat tasks
 * @param args values of the init call data as an array of strings where each string represents variable value
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
  fullName: string,
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
      deploymentArgs.constructor[fullName] !== undefined
    ) {
      output = extractArgs(deploymentArgs.constructor[fullName]);
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
  fullName: string,
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
      deploymentArgs.initializer[fullName] !== undefined
    ) {
      output = extractArgs(deploymentArgs.initializer[fullName]);
    }
  } else {
    output = undefined;
  }
  return output;
}

export async function getSalt(fullName: string, artifacts: Artifacts) {
  return await getCustomNSTag(fullName, "salt", artifacts);
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
export async function getDeployType(fullName: string, artifacts: Artifacts) {
  return await getCustomNSTag(fullName, "deploy-type", artifacts);
}

export async function getDeployGroup(fullName: string, artifacts: Artifacts) {
  return await getCustomNSTag(fullName, "deploy-group", artifacts);
}

export async function getDeployGroupIndex(
  fullName: string,
  artifacts: Artifacts
) {
  return await getCustomNSTag(fullName, "deploy-group-index", artifacts);
}
