/*
 * tracks.js
 */

const path = require('path')
const fs = require('fs')
const { promisify } = require('util')
const exists = promisify(fs.exists)
const md5 = require('md5')
const { prop, groupBy } = require('ramda')

const sliceAndMerge = require('../helpers/slice-and-merge.js')
const valueAt = require('../helpers/value-at.js')
const dbIHEC = require('../db-ihec.js')
const config = require('../config.js')
const Samples = require('./samples.js')

module.exports = {
  get,
  values,
  merge,
}

function get(chrom, position) {

  const makeQuery = samples => `
      SELECT track.id
           , institution.short_name
           , sample_name
           , donor
           , track.view
           , track.track_type
           , track.id as id
           , assembly.name as assembly
           , assay.name as assay
           , assay.id as assay_id
           , assay_category.name as assay_category
           , assay_category.id as assay_category_id
        FROM dataset_track as track
        JOIN dataset on dataset.id = track.dataset_id
        JOIN assay on assay.id = dataset.assay_id
        JOIN assay_category on assay_category.id = assay.assay_category_id
        JOIN data_release on data_release.id = dataset.data_release_id
        JOIN assembly on assembly.id = data_release.assembly_id
        JOIN institution on institution.id = data_release.provider_institution_id
       WHERE donor IN (${samples.map(dbIHEC.escape).join(', ')})
              AND track_type = 'bigWig'
    `

  return Samples.queryMap(chrom, position).then(info =>
    dbIHEC.query(makeQuery(Object.keys(info.samples)))
    .then(tracks => {
      tracks.forEach(track => {
        track.path = getLocalPath(track)
        Object.assign(track, info.samples[track.donor])
      })
      return tracks
    })
  )
}

function values(chrom, position) {
  return get(chrom, position)
  .then(tracks => tracks.filter(t => fs.existsSync(t.path)))
  .then(tracks =>
    Promise.all(tracks.map(track =>
      valueAt(track.path, { chrom, position, ...config.merge })
      .then(data => ({
        id: track.id,
        donor: track.donor,
        assay: track.assay,
        variant: track.variant,
        type: track.type,
        value: track.value,
        data,
      }))
    )))
}

function merge(tracks, { chrom, start, end }) {

  const tracksByAssay = groupBy(prop('assay'), tracks)

  return Promise.all(Object.entries(tracksByAssay).map(([assay, tracks]) => {

    const tracksByType = groupBy(prop('type'), tracks)

    if (tracksByType.HET === undefined && tracksByType.HOM === undefined)
      return undefined

    return Promise.all(
      [
        tracksByType.REF,
        tracksByType.HET || [],
        tracksByType.HOM || []
      ].map(tracks =>
        mergeFiles(tracks.map(prop('path')), { chrom, start, end })
      )
    )
    .then(output => ({ assay, tracks, output }))
  }))
  .then(results => results.filter(Boolean))
}


function mergeFiles(paths, { chrom, start, end }) {
  paths.sort(Intl.Collator().compare)
  const mergeHash = md5(JSON.stringify({ paths, chrom, start, end }))
  const mergeName = mergeHash + '.bw'
  const url = `/merged/${mergeName}`
  const mergePath = path.join(config.paths.mergedTracks, mergeName)

  return exists(mergePath)
    .then(yes => yes ? true : sliceAndMerge(paths, { output: mergePath, chrom, start, end, ...config.merge }))
    .then(() => ({ path: mergePath, url }))
}

function getLocalPath(track) {
  return path.join(
    config.paths.tracks,
    track.short_name,
    track.assembly,
    [
      track.id,
      track.short_name,
      track.sample_name,
      track.assay,
      track.view,
      track.track_type
    ].join('.')
  )
}
