const { List, Map } = require('immutable')
const assert = require('chai').assert
const utils = require('demo-utils')
const { toJS, fromJS, getConfig, getNetwork } = utils
const { BuildsManager, Linker, isLink, Deployer, isDeploy, isCompile, isContract, createBM }
  = require('demo-contract')
const { Compiler } = require('demo-compile')
const { RemoteDB } = require('demo-client')

const LOGGER = new utils.Logger('departure')

const departs = {}

/**
 * Orchestrate a reproducible, idempotent departure of smart contracts for the blockchain,
 * storing artifacts for later web interfaces.
 *
 * @method depart
 * @memberof @module:depart
 * @param name {String} optional, a human-readable name
 * @param autoConfig {Boolean} optional, whether to automatically connect to the automatically
 *        configured remote store. Default is `true`.
 * @param sourcePath {String} local source path of Solidity contracts.
 * @param callback {Function} the departure function that is passed in
 *        `{bm, compile, link, deploy, deployerEth, deployerAddress, wallet}`
 */
/*
departs.depart = async ({name, autoConfig, sourcePath}) => {
  assert(callback, " `callback` param needed to run departure function.")

  LOGGER.info(`Now departing: ${name}`)

  const deployerAddress = getConfig()['DEPLOYER_ADDRESS']
  LOGGER.info(`Deployer Address: ${deployerAddress}`)
  const deployerPassword = getConfig()['DEPLOYER_PASSWORD']
  await wallet.init({ autoConfig: true, unlockSeconds: 30 })
  const { signerEth: deployerEth } = await wallet.prepareSignerEth({
      address  : deployerAddress,
      password : deployerPassword,
    })

  const chainId  = await deployerEth.net_version()
}
*/
departs.departMixin = ({ name, autoConfig, sourcePath }) => {
  return async (state) => {
    assert( state.get('chainId'), `chainId not in input state.` )
    assert( state.get('deployerEth'), `deployerEth not in input state.` )
    assert( state.get('deployerAddress'), `deployerAddress not in input state.` )

    const bm = await createBM({
      sourcePath: sourcePath,
      chainId   : state.get('chainId'),
      autoConfig: !(autoConfig === false),
    })

    const c = new Compiler({
      startSourcePath: sourcePath, bm: bm
    })
    const l = new Linker({
      bm: bm
    })
    const d = new Deployer({
      bm: bm, chainId: state.get('chainId'),
      eth: state.get('deployerEth'), address: state.get('deployerAddress')
    })

    let compiles = new Map()
    const compile = async ( contractName, sourceFile ) => {
      assert(sourceFile && sourceFile.endsWith('.sol'),
             'sourceFile param not given or does not end with .sol extension')
      const output = await c.compile( sourceFile )
      assert(isCompile(output))
      assert.equal( output.get(contractName).get('name'), contractName )
      return new Promise((resolve, reject) => {
        setTimeout( async () => {
          const contract = await bm.getContract(contractName)
          assert( isContract(contract), `Contract ${contractName} not found` )
          compiles = compiles.set(contractName, output.get(contractName))
          resolve(output)
        }, 2000)
      })
    }

    let links    = new Map()
    const link = async ( contractName, linkId, depMap ) => {
      assert(contractName, 'contractName param not given')
      assert(linkId, 'link name not given')
      const linkName = `${contractName}-${linkId}`
      let output = await bm.getLink( linkName )
      if (!isLink(output)) {
        output = await l.link( contractName, linkId, depMap )
      }
      assert(isLink(output))
      links = links.set(linkName, output)
      return output
    }

    let deploys  = new Map()
    const deploy = async ( contractName, linkId, deployId, ctorArgList, force ) => {
      assert(contractName, 'contractName param not given')
      assert(linkId, 'linkId param not given')
      assert(deployId, 'deployId param not given')
      const deployName = `${contractName}-${deployId}`
      const output = await d.deploy( contractName, linkId, deployId, ctorArgList, force )
      assert( isDeploy(output) )
      deploys = deploys.set(deployName, output)
      return output
    }

    const getCompiles = () => {
      return compiles
    }

    const getLinks = () => {
      return links
    }

    const getDeploys = () => {
      return deploys
    }

    const clean = async () => {
      const compileList = List(compiles.map((c, name) => {
        return bm.cleanContract( name )
      }).values()).toJS()
      await Promise.all( compileList ).then((vals) => { LOGGER.info( 'Clean compiles', vals) })

      const linkList = List(links.map((l, name) => {
        return bm.cleanLink( name )
      }).values()).toJS()
      await Promise.all( linkList ).then((vals) => { LOGGER.info( 'Clean links', vals) })

      const deployList = List(deploys.map((d, name) => {
        return bm.cleanDeploy( name )
      }).values()).toJS()
      await Promise.all( deployList ).then((vals) => { LOGGER.info( 'Clean deploys', vals) })
    }

    return new Map({
      departName  : name,
      clean       : clean,
      deploy      : deploy,
      link        : link,
      compile     : compile,
      bm          : bm,
      getCompiles : getCompiles,
      getLinks    : getLinks,
      getDeploys  : getDeploys,
    })

  }

}

module.exports = departs
