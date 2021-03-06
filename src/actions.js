"use strict";

const R = require('ramda')
    , d3 = require('d3')
    , isURL = require('is-url')
    , MarkdownIt = require('markdown-it')
    , { makeTypedAction } = require('org-async-actions')
    , saveAs = require('file-saver')
    , { LoadingStatus, ProjectSource } = require('./types')
    , { projectForView } = require('./utils')

function isIterable(obj) {
  return Symbol.iterator in obj
}

function getGlobalConfigURL() {
  const configURL = global.DREDGE_PROJECT_CONFIG_URL

  if (!configURL) return null

  return new URL(configURL, window.location.href).href
}

function getGlobalWatchedGenesKey() {
  return window.location.pathname + '-watched'
}

const Action = module.exports = makeTypedAction({
  Log: {
    exec: R.always({}),
    request: {
      project: d => typeof d === 'string' || d === null,
      resourceName: d => typeof d === 'string' || d === null,
      resourceURL: d => typeof d === 'string' || d === null,
      status: LoadingStatus,
    },
    response: {},
  },

  SetTitle: {
    exec: R.always({}),
    request: {
      title: d => typeof d === 'string' || d === null,
    },
    response: {},
  },

  ResetLog: {
    exec: R.always({}),
    request: {
      project: d => typeof d === 'string' || d === null,
    },
    response: {},
  },

  CheckCompatibility: {
    exec: checkCompatibility,
    request: {},
    response: {},
  },

  LoadProjectConfig: {
    exec: loadProjectConfig,
    request: {
      source: ProjectSource,
    },
    response: {
      config: d => typeof d === 'object' || d === null,
    },
  },

  UpdateLocalConfig: {
    exec: R.always({}),
    request: {
      update: Function,
    },
    response: {},
  },

  LoadProject: {
    exec: loadProject,
    request: {
      source: ProjectSource,
    },
    response: {
      savedTranscripts: Object,
    },
  },

  UpdateProject: {
    exec: R.always({}),
    request: {
      source: ProjectSource,
      update: Function,
    },
    response: {},
  },

  // Everything below here works on the "current view"

  SetPairwiseComparison: {
    exec: setPairwiseComparison,
    request: {
      TreatmentA: String,
      TreatmentB: String,
    },
    response: {
      pairwiseData: d => d.constructor === Map,
      resort: Boolean,
    },
  },

  GetDefaultPairwiseComparison: {
    exec: getDefaultPairwiseComparison,
    request: {},
    response: {
      treatmentA: String,
      treatmentB: String,
    },
  },

  UpdateDisplayedTranscripts: {
    exec: updateDisplayedTranscripts,
    request: {
      sortPath: d => d == null || Array.isArray(d),
      order: d => d == null || d === 'asc' || d === 'desc',
    },
    response: {
      displayedTranscripts: Object,
    },
  },

  SetSavedTranscripts: {
    exec: setSavedTranscripts,
    request: {
      transcriptNames: isIterable,
    },
    response: {
      resort: Boolean,
    },
  },

  SetBrushedTranscripts: {
    exec: R.always({ resort: true }),
    request: {
      transcriptNames: isIterable,
    },
    response: {
      resort: Boolean,
    },
  },

  SetHoveredTranscript: {
    exec: R.always({}),
    request: {
      transcriptName: d => typeof d === 'string' || d === null,
    },
    response: {
    },
  },

  SetHoveredTreatment: {
    exec: R.always({}),
    request: {
      treatmentName: d => typeof d === 'string' || d === null,
    },
    response: {
    },
  },

  SetFocusedTranscript: {
    exec: R.always({}),
    request: {
      transcriptName: String,
    },
    response: {
    },
  },

  SetPValueThreshold: {
    exec: R.always({}),
    request: {
      threshold: Number,
    },
    response: {
    },
  },

  ImportSavedTranscripts: {
    exec: importSavedTranscripts,
    request: {
      file: Object,
    },
    response: {},
  },

  ExportSavedTranscripts: {
    exec: exportSavedTranscripts,
    request: {},
    response: {},
  },
})

const configFields = {
  label: {
    label: 'Project label',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Must be a string')
      }
    },
  },

  url: {
    label: 'Project URL',
    test: val => {
      if (!isURL(val)) {
        throw new Error('Value should be a URL')
      }
    },
  },

  readme: {
    label: 'Project Readme',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Value should be a URL pointing to a file')
      }
    },
  },

  abundanceMeasures: {
    label: 'Treatment abundance measures',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Value should be a URL pointing to a file')
      }
    },
  },

  abundanceLimits: {
    label: 'Limits for abundance mesaures',
    test: val => {
      const isArrayOfTwo = val => Array.isArray(val) && val.length === 2

      const ok = (
        isArrayOfTwo(val) &&
        isArrayOfTwo(val[0]) &&
        isArrayOfTwo(val[1]) &&
        typeof val[0][0] === 'number' &&
        typeof val[0][1] === 'number' &&
        typeof val[1][0] === 'number' &&
        typeof val[1][1] === 'number'
      )

      if (!ok) {
        throw new Error('Value must be an array of an array of two numbers')
      }
    },
  },

  treatments: {
    label: 'Treatment descriptions',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Value should be a URL pointing to a file')
      }
    },
  },

  pairwiseName: {
    label: 'Pairwise file naming format',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Value should be a URL pointing to a file')
      }

      if (!(val.includes('%A') && val.includes('%B'))) {
        throw new Error('Value should be a template for loading pairwise comparisons, using %A and %B as placeholders.')
      }
    },
  },

  transcriptHyperlink: {
    label: 'Transcript hyperlink',
    test: val => {
      if (val == undefined) return

      const isOK = (
        Array.isArray(val) &&
        val.every(x =>
          typeof x === 'object' &&
          typeof x.label === 'string' &&
          typeof x.url === 'string'
        )
      )

      if (!isOK) {
        throw new Error('Value should by an array of { label, url } objects')
      }

      const hasTemplate = val.every(x => x.url.includes('%name'))

      if (!hasTemplate) {
        throw new Error('Every object should contain a `url` key containing the string "%name"')
      }
    },
  },

  transcriptAliases: {
    label: 'Alternate names for transcripts',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Value should be a URL pointing to a file')
      }
    },
  },

  diagram: {
    label: 'Project diagram',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Value should be a URL pointing to a file')
      }
    },
  },

  grid: {
    label: 'Project grid',
    test: val => {
      if (typeof val !== 'string') {
        throw new Error('Value should be a URL pointing to a file')
      }
    },
  },
}

function trim(x) {
  return x.trim()
}

function notBlank(x) {
  return x
}

const processedConfigFields = {
  transcriptAliases: {
    label: 'Transcript aliases',
    exec: async url => {
      const resp = await fetchResource(url)

      try {
        const aliases = await resp.text()
            , transcriptAliases = {}

        let i = 0;
        for (const line of aliases.split('\n')) {
          const [ canonical, ...others ] = line.split(/\t|,/).map(trim).filter(notBlank)
          transcriptAliases[canonical] = others
          i++
          if (i % 1500 === 0) await delay(0)
        }

        return { transcriptAliases }
      } catch (e) {
        throw new Error('Error parsing file')
      }
    },
  },

  abundanceMeasures: {
    label: 'Transcript abundance measures',
    exec: async (url, treatments) => {
      const resp = await fetchResource(url)

      try {
        return await parseAbundanceFile(resp, treatments)
      } catch (e) {
        throw new Error('Error parsing file')
      }
    },
  },

  readme: {
    label: 'Project documentation',
    exec: async (url, treatments) => {
      const resp = await fetchResource(url, false)

      const md = new MarkdownIt()

      try {
        const markdown = await resp.text()
        return { readme: md.render(markdown) }
      } catch (e) {
        throw new Error('Error parsing file')
      }
    },
  },

  diagram: {
    label: 'SVG diagram',
    exec: async (url, treatments) => {
      const resp = await fetchResource(url, false)

      try {
        const svg = cleanSVGString(await resp.text(), treatments)

        return { svg }
      } catch (e) {
        throw new Error('Error parsing file')
      }
    },
  },

  grid: {
    label: 'Transcript grid',
    exec: async (url, treatments) => {
      const resp = await fetchResource(url, false)

      try {
        let grid = d3.csvParseRows(await resp.text())

        grid = grid.map(row => row.map(treatment => {
          if (!treatment) return null

          if (!treatments.hasOwnProperty(treatment)) {
            const e = new Error()
            e.reason = `Treatment ${treatment} not in project`
            throw e;
          }

          return treatment
        }))

        return { grid }
      } catch (e) {
        let message = 'Error parsing file'

        if (e.reason) {
          message += `: ${e.reason}`
        }

        throw new Error(message)
      }
    },
  },
}

function delay(time) {
  if (time === 0 && window.setTimeout) {
    return new Promise(resolve => setImmediate(resolve))
  } else {
    return new Promise(resolve => setTimeout(resolve, time))
  }
}

async function fetchResource(url, cache=true) {
  const headers = new Headers()

  if (!cache) {
    headers.append('Cache-Control', 'no-cache')
  }

  const resp = await fetch(url, { headers })

  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error('File not found')
    }

    throw new Error(`Error requesting file (${resp.statusText || resp.status })`)
  }

  return resp
}

async function parseAbundanceFile(resp) {
  const abundanceRows = (await resp.text()).split('\n')
      , replicates = abundanceRows.shift().split('\t').slice(1)
      , transcripts = []
      , abundances = []

  let i = 0

  for (let row of abundanceRows) {
    row = row.split('\t')
    transcripts.push(row.shift())
    abundances.push(row.map(parseFloat))
    i++

    if (i % 1000 === 0) await delay(0)
  }

  return {
    transcripts,
    replicates,
    abundances,
  }
}

function cleanSVGString(svgString, treatments) {
  const parser = new DOMParser()
      , svgDoc = parser.parseFromString(svgString, 'image/svg+xml')
      , iterator = svgDoc.createNodeIterator(svgDoc, NodeFilter.SHOW_ELEMENT)
      , treatmentNames = new Set(Object.keys(treatments))

  let curNode

  ;[...svgDoc.querySelectorAll('title')].forEach(el => {
    el.parentNode.removeChild(el)
  })

  const anchorsToRemove = []

  while ( (curNode = iterator.nextNode()) ) {
    switch (curNode.nodeName.toLowerCase()) {
      case 'path':
      case 'rect':
      case 'circle':
      case 'elipse':
      case 'polyline':
      case 'polygon': {
        let treatment = null

        const popTreatmentFromAttr = attr => {
          treatment = curNode.getAttribute(attr)
          if (treatmentNames.has(treatment)) {
            curNode.removeAttribute(attr)
            return true
          }
          return false
        }

        popTreatmentFromAttr('id') || popTreatmentFromAttr('name')

        if (treatment) {
          const { label } = treatments[treatment]

          curNode.setAttribute('data-treatment', treatment)

          const titleEl = document.createElement('title')
          titleEl.textContent = label || treatment

          curNode.appendChild(titleEl)
          treatmentNames.delete(treatment)

          // Illustrator, for some reason, makes all paths the child of
          // an anchor tag. That messes up our clicking business. We
          // could probably preventDefault() or stopPropagation()
          // somewhere, but I'm just removing them here.
          const replaceParent = (
            curNode.parentNode.nodeName.toLowerCase() === 'a' &&
            curNode.parentNode.children.length === 1
          )

          if (replaceParent) {
            anchorsToRemove.push(curNode.parentNode)
          }
        }

        break;
      }
    }

    // Remove ID, since multiple instances of this SVG will be in the
    // document. Alternatively, the whole thing could always be wrapped
    // in an iframe, but that would require inter-frame communication,
    // which seems like a pain in the ass.
    curNode.removeAttribute('id')
  }

  anchorsToRemove.forEach(el => {
    el.replaceWith(el.children[0])
  })

  return svgDoc.rootElement.outerHTML
}


// Actions ----------------

function checkCompatibility() {
  return () => {

    if (!window.indexedDB) {
      throw new Error('Browser does not support IndexedDB standard. Cannot run application.')
    }

    if (!window.Blob) {
      throw new Error('Browser does not support Blob standard. Cannot run application.')
    }

    return {}
  }
}

function getDefaultPairwiseComparison() {
  return async (dispatch, getState) => {
    const project = projectForView(getState())
        , { treatments } = project
        , [ treatmentA, treatmentB ] = Object.keys(treatments)

    return {
      treatmentA,
      treatmentB,
    }
  }
}

function loadProject(source) {
  return async (dispatch, getState) => {
    let config, loaded

    const refresh = () => {
      ({
        config,
        loaded,
      } = R.path(['projects', source.key], getState()))
    }

    refresh()

    if (!config) {
      await dispatch(Action.LoadProjectConfig(source));
      refresh()
    }

    if (!loaded) {
      const onUpdate = val => dispatch(Action.UpdateProject(
        source,
        project => Object.assign({}, project, val)))

      const makeLog = (label, url) => async status => {
        await delay(0)
        return dispatch(Action.Log(
          source.key,
          label,
          url,
          status
        ))
      }

      await fetchProject(config, makeLog, onUpdate)

      const project = R.path(['projects', source.key], getState())

      const corpus = {}
          , corpusVals = []

      const log = makeLog('Transcript corpus', null)

      {

        await log(LoadingStatus.Pending(null))

        let i = 0
        for (const [ transcript, aliases ] of Object.entries(project.transcriptAliases || {})) {
          [...aliases, transcript].forEach(alias => {
            corpus[alias] = transcript
            corpusVals.push([alias, transcript])
          })

          i++
          if (i % 5000 === 0) await delay(0)
        }

        i = 0
        if (project.transcripts) {
          project.transcripts.forEach(transcript => {
            if (!(transcript in corpus)) {
              corpus[transcript] = transcript
              corpusVals.push([transcript, transcript])
            }
          })
          i++
          if (i % 5000 === 0) await delay(0)
        }

      }

      const searchTranscripts = (name, limit=20) => {
        const results = []

        for (const x of corpusVals) {
          if (x[0].startsWith(name)) {
            results.push({
              alias: x[0],
              canonical: x[1],
            })

            if (results.length === limit) break;
          }
        }

        return results
      }

      const getCanonicalTranscriptLabel = transcript => corpus[transcript]

      const transcriptIndices = {}
          , replicateIndices = {}

      {
        let i = 0
        for (const t of project.transcripts) {
          transcriptIndices[getCanonicalTranscriptLabel(t)] = i;
          i++
          if (i % 500 === 0) await delay(0)
        }
      }

      {
        let i = 0
        for (const r of project.replicates) {
          replicateIndices[r] = i;
          i++
          if (i % 500 === 0) await delay(0)
        }
      }

      await log(LoadingStatus.OK(null))

      const abundancesForTreatmentTranscript = (treatmentID, transcriptName) => {
        const treatment = project.treatments[treatmentID]
            , transcriptIdx = transcriptIndices[getCanonicalTranscriptLabel(transcriptName)]

        return treatment.replicates.map(replicateID => {
          const replicateIdx = replicateIndices[replicateID]
          return project.abundances[transcriptIdx][replicateIdx]
        })
      }

      await dispatch(Action.UpdateProject(
        source,
        project => Object.assign({}, project, {
          pairwiseComparisonCache: {},
          searchTranscripts,
          getCanonicalTranscriptLabel,
          abundancesForTreatmentTranscript,
        })))
    }

    if (source.key === 'local') {
      return { savedTranscripts: new Set([]) }
    }

    const savedTranscriptKey = getGlobalWatchedGenesKey()

    const savedTranscripts = new Set(
      JSON.parse(localStorage[savedTranscriptKey] || '[]'))

    return { savedTranscripts }
  }
}

async function fetchProject(config, makeLog, onUpdate) {
  let failed = false
    , treatments

  const { baseURL } = config

  // Load treatments before anything else
  {
    const url = new URL(config.treatments, baseURL).href
        , log = makeLog('Project treatments', url)

    await log(LoadingStatus.Pending(null))

    try {
      const resp = await fetchResource(url, false)

      try {
        treatments = await resp.json()

        await onUpdate({ treatments })

      } catch (e) {
        failed = true
        throw new Error('Project treatments malformed')
      }
      await log(LoadingStatus.OK(null))
    } catch (e) {
      failed = true
      await log(LoadingStatus.Failed(e.message))
    }
  }

  if (failed) {
    throw new Error('Could not load project because treatments not available')
  }

  await Promise.all(Object.entries(processedConfigFields).map(async ([ k, v ]) => {
    let url = config[k]

    if (!url) {
      makeLog(v.label, null)(LoadingStatus.Missing('No filename specified.'))
      return;
    }

    url = new URL(url, baseURL).href
    const log = makeLog(v.label, url)

    await log(LoadingStatus.Pending(null))

    try {
      const val = await v.exec(url, treatments)
      await onUpdate(val)
      await log(LoadingStatus.OK(null))
    } catch(e) {
      await log(LoadingStatus.Failed(e.message))
    }
  }))
}

function loadProjectConfig(source) {
  return async (dispatch, getState) => {
    const existing = R.path(['projects', source.key, 'config'], getState())

    if (existing) return { config: existing }

    const makeProjectLog = R.curry((label, url, status) => {
      return dispatch(Action.Log(
        source.key,
        label,
        url,
        status
      ))
    })

    // We should only be dealing with the global config at this point, because
    // the local one is set beforehand. But maybe we want to support loading
    // arbitrary remote projects at some point (again, lol). In that case, the
    // global project would not be assumed.
    const configURL = getGlobalConfigURL()

    if (!configURL) return { config: null }

    const baseURL = new URL('./', configURL).href

    let loadedConfig = {}

    {
      const log = makeProjectLog('Project configuration', configURL)

      await log(LoadingStatus.Pending(null))

      try {
        const resp = await fetchResource(configURL, false)

        try {
          loadedConfig = await resp.json()
        } catch (e) {
          throw new Error('Project configuration file malformed')
        }

        await log(LoadingStatus.OK(null))
      } catch (e) {
        await log(LoadingStatus.Failed(e.message))

        return { config: null }
      }
    }

    const config = { baseURL }

    await Promise.all(Object.entries(configFields).map(async ([ key, { label, test }]) => {
      const url = new URL(`project.json#${key}`, baseURL).href
          , log = makeProjectLog(label, url)

      await log(LoadingStatus.Pending(null))

      const val = loadedConfig[key]

      if (!val) {
        await log(LoadingStatus.Missing('No value specified'))
        return
      }

      try {
        test(val);

        await log(LoadingStatus.OK(null))

        config[key] = val
      } catch (e) {
        await log(LoadingStatus.Failed(e.message))
      }
    }))

    await delay(0)

    return { config }
  }
}


// Load the table produced by the edgeR function `exactTest`:
// <https://rdrr.io/bioc/edgeR/man/exactTest.html>
function setPairwiseComparison(treatmentAKey, treatmentBKey) {
  return async (dispatch, getState) => {
    const project = projectForView(getState())

    const cached = project.pairwiseComparisonCache[[treatmentAKey, treatmentBKey]]

    if (cached) {
      await delay(0);

      return {
        pairwiseData: cached,
        resort: true,
      }
    }

    const treatmentA = project.treatments[treatmentAKey]
        , treatmentB = project.treatments[treatmentBKey]

    if (!treatmentA) {
      throw new Error(`No such treatment: ${treatmentAKey}`)
    }

    if (!treatmentB) {
      throw new Error(`No such treatment: ${treatmentBKey}`)
    }

    const urlTemplate = project.config.pairwiseName || './pairwise_tests/%A_%B.txt'

    const fileURLA = new URL(
      urlTemplate.replace('%A', treatmentAKey).replace('%B', treatmentBKey),
      project.config.baseURL).href

    const fileURLB = new URL(
      urlTemplate.replace('%A', treatmentBKey).replace('%B', treatmentAKey),
      project.config.baseURL).href

    let reverse = false
      , resp

    const [ respA, respB ] = await Promise.all([
      fetch(fileURLA),
      fetch(fileURLB),
    ])

    if (respA.ok) {
      resp = respA
      reverse = true
    } else if (respB.ok) {
      resp = respB
    } else {
      throw new Error(`Could not download pairwise test from ${fileURLA} or ${fileURLB}`)
    }

    const text = await resp.text()

    const pairwiseData = text
      .trim()
      .split('\n')
      .slice(1) // Skip header
      .map(row => {
        const [ id, logFC, logATA, pValue ] = row.split('\t')

        const name = project.getCanonicalTranscriptLabel(id)

        return [name, {
          name,
          logFC: (reverse ? -1 : 1 ) * parseFloat(logFC),
          logATA: parseFloat(logATA),
          pValue: parseFloat(pValue),
        }]
      })

    return {
      pairwiseData: new Map(pairwiseData),
      resort: true,
    }
  }
}

function updateDisplayedTranscripts(sortPath, order) {
  return (dispatch, getState) => {
    const { view } = getState()
        , project = projectForView(getState())

    const {
      savedTranscripts,
      brushedTranscripts,
      comparedTreatments,
      pairwiseData,
    } = view

    const { abundancesForTreatmentTranscript } = project
        , [ treatmentA, treatmentB ] = comparedTreatments

    const listedTranscripts = brushedTranscripts.size
      ? brushedTranscripts
      : savedTranscripts

    const unsorted = [...listedTranscripts].map(transcriptName => {
      if (!pairwiseData) {
        return {
          transcript: { name: transcriptName },
          saved: savedTranscripts.has(transcriptName),
        }
      }

      const transcript = pairwiseData.get(transcriptName) || {
        name: project.getCanonicalTranscriptLabel(transcriptName),
      }

      const [
        treatmentA_AbundanceMean,
        treatmentA_AbundanceMedian,
        treatmentB_AbundanceMean,
        treatmentB_AbundanceMedian,
      ] = R.chain(
        abundances => [d3.mean(abundances), d3.median(abundances)],
        [abundancesForTreatmentTranscript(treatmentA, transcriptName), abundancesForTreatmentTranscript(treatmentB, transcriptName)]
      )

      return {
        transcript,
        treatmentA_AbundanceMean,
        treatmentA_AbundanceMedian,
        treatmentB_AbundanceMean,
        treatmentB_AbundanceMedian,
      }
    })

    if (!sortPath) sortPath = view.sortPath
    if (!order) order = view.order

    const getter =
      sortPath.includes('name')
        ? R.pipe(R.path(sortPath), R.toLower)
        : R.path(sortPath)

    const comparator = (order === 'asc' ? R.ascend : R.descend)(R.identity)

    const displayedTranscripts = R.sort(
      (a, b) => {
        a = getter(a)
        b = getter(b)

        if (a === undefined) return 1
        if (b === undefined) return -1

        return comparator(a, b)
      },
      unsorted
    )

    return { displayedTranscripts }
  }
}

function setSavedTranscripts(savedTranscripts) {
  return (dispatch, getState) => {
    if(R.path(['view', 'source', 'key'], getState()) === 'global') {
      const key = getGlobalWatchedGenesKey()
          , savedTranscriptsStr = JSON.stringify([...savedTranscripts])

      localStorage.setItem(key, savedTranscriptsStr)
    }

    return { resort: true }
  }
}

function importSavedTranscripts(file) {
  return (dispatch, getState) => new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = async e => {
      const text = e.target.result

      try {
        const importedWatchedTranscripts = text.trim().split('\n')

        // TODO: Filter out those things that aren't in `project.transcripts`

        const existingWatchedTranscripts = getState().view.savedTranscripts

        await dispatch(Action.SetSavedTranscripts(
          [...importedWatchedTranscripts, ...existingWatchedTranscripts]
        ))

        resolve({})
      } catch (e) {
        reject('didn\'t work')
      }
    }

    reader.readAsText(file)
  })
}

function exportSavedTranscripts() {
  return (dispatch, getState) => {
    const { savedTranscripts } = getState().view

    const blob = new Blob([ [...savedTranscripts].join('\n') ], { type: 'text/plain' })

    saveAs(blob, 'saved-transcripts.txt')

    return {}
  }
}
