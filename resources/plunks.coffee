_ = require("lodash")
nconf = require("nconf")
genid = require("genid")
diff_match_patch = require("googlediff")
gate = require("json-gate")
analytics = require("analytics-node")
LRU = require("lru-cache")



gdiff = new diff_match_patch()
apiErrors = require("../errors")
apiUrl = nconf.get('url:api')
database = require("../database")

{Plunk} = database



exports.schema =
  create: gate.createSchema(require("./schema/plunks/create.json"))
  fork: gate.createSchema(require("./schema/plunks/fork.json"))
  update: gate.createSchema(require("./schema/plunks/update.json"))

createLinksObject = (baseUrl, page, pages, limit) ->
  links = {}

  if page < pages
    links.next = "#{baseUrl}?p=#{page+1}&pp=#{limit}"
    links.last = "#{baseUrl}?p=#{pages}&pp=#{limit}"
  if page > 1
    links.prev = "#{baseUrl}?p=#{page-1}&pp=#{limit}"
    links.first = "#{baseUrl}?p=1&pp=#{limit}"

  links

createEvent = (type, user) ->
  event =
    event: type or "create"
    changes: []

  event.user = user._id if user

  event

# Versions are 0-indexed
dmp = new diff_match_patch()
verCache = LRU(128) # 500 is an arbitrary number
revertTo = (current, version, cb) ->
  # Return current if requesting a version that exceeds current version
  return current unless current.history?.length
  return current if version >= current.history.length

  # Don't cache plunks for people who are the owners
  if !current.token and cached = verCache.get("#{current.id}/#{version}")
    return cached

  size = (current.history.length or 1) - 1
  rel = size - version

  rename = (fn, to) ->
    if file = current.files[fn]
      file.filename = to
      delete current.files[fn]
      current.files[to] = file

  patch = (fn, patches) ->
    if file = current.files[fn]
      [file.content] = dmp.patch_apply(patches, file.content)

  remove = (fn) ->
    delete current.files[fn]
  try
    for i in [0...rel]
      for chg, j in current.history[size - i].changes
        # The changed file existed previously
        if chg.pn
          if chg.fn
            # File changed
            if chg.pl
              #console.log "Patching", chg.fn, "to", chg.pl
              patch(chg.fn, dmp.patch_fromText(chg.pl))
            # File renamed
            if chg.pn != chg.fn
              #console.log "Renaming", chg.pn, "to", chg.fn
              rename(chg.fn, chg.pn)
          else # Deleted the file
            #console.log "Adding", chg.fn, chg.pl
            current.files[chg.pn] =
              filename: chg.pn
              content: chg.pl
        else if chg.fn
          #console.log "Deleting", chg.fn
          remove(chg.fn)
  catch e
    console.trace "[ERR] Failed to revert #{current.id} to version #{version}:", e

  current.currentVersion = version

  unless current.token
    verCache.set "#{current.id}/#{version}", current

  current

ownsPlunk = (session, json) ->
  owner = false

  if session
    owner ||= !!(json.user and session.user and json.user is session.user._id)
    owner ||= !!(json.user and session.user and json.user.login is session.user.login)
    owner ||= !!(session.keychain and session.keychain.id(json.id)?.token is json.token)

  owner

saveNewPlunk = (plunk, cb) ->
  # Keep generating new ids until not taken
  savePlunk = ->
    plunk._id = if !!plunk.private then genid(20) else genid(6)

    plunk.save (err) ->
      if err
        if err.code is 11000 then savePlunk()
        else
          console.error "[ERR]", err.message, err
          return cb(new apiErrors.DatabaseError(err))
      else return cb(null, plunk)

  savePlunk()

populatePlunk = (json, options = {}) ->
  plunk = options.plunk or new Plunk
  plunk.description = json.description or "Untitled"
  plunk.private = json.private != false
  plunk.source = json.source
  plunk.user = options.user._id if options.user
  plunk.fork_of = options.parent._id if options.parent
  plunk.tags.push(tag) for tag in json.tags unless options.skipTags
  plunk.type = if options.type in ["plunk", "template"] then options.type else "plunk"

  unless options.skipFiles then for filename, file of json.files
    plunk.files.push
      filename: file.filename or filename
      content: file.content

  plunk

preparePlunk = (plunk, json, options) ->
  # This is a sub-document of the plunk
  return json if 'function' == typeof plunk.ownerDocument

  corrected = false

  if (was = plunk.voters?.length) != plunk.thumbs
    console.log "[INFO] Correcting thumbs for #{plunk.id} from #{plunk.thumbs} to #{plunk.voters.length}"

    plunk.thumbs = plunk.voters.length

    corrected = true

  if (was = plunk.forks?.length) != plunk.forked
    console.log "[INFO] Correcting forks for #{plunk.id} from #{was} to #{plunk.forks.length}"

    plunk.forked = plunk.forks.length

    corrected = true

  if (was = plunk.score) and plunk.score != plunk.created_at.valueOf() + calculateScore(plunk.thumbs)
    delta = calculateScore(plunk.thumbs)
    console.log "[INFO] Correcting score for #{plunk.id} from #{was} to #{delta / (1000 * 60 * 60)}"
    plunk.score = json.score = plunk.created_at.valueOf() + delta

    corrected = true


  if corrected then plunk.save() # Issue a save asynchronously and don't care about result

  delete json.token unless ownsPlunk(options.session, plunk)
  delete json.voters
  delete json.rememberers
  delete json._id
  delete json.__v
  if json.files then json.files = do ->
    files = {}
    for file in json.files
      file.raw_url = "#{json.raw_url}#{file.filename}"
      files[file.filename] = file
    files

  # Unless the current user owns the plunk o
  if !json.token and json.frozen_at and json.history
    json.frozen_version ?= json.history.length - 1
    json = revertTo json, json.frozen_version
    json.history = json.history.slice(0, json.frozen_version + 1) if json.history


  json.thumbed = options.session?.user? and plunk.voters?.indexOf("#{options.session.user._id}") >= 0
  json.remembered = options.session?.user? and plunk.rememberers?.indexOf("#{options.session.user._id}") >= 0
  json.user = options.user.toJSON() if options.user

  json

preparePlunks = (session, plunks) ->
  _.map plunks, (plunk) ->
    plunk.toJSON
      session: session
      transform: preparePlunk
      virtuals: true
      getters: true

applyFilesDeltaToPlunk = (plunk, json) ->
  oldFiles = {}
  changes = []

  return changes unless json.files

  # Create a map of filename=>file (subdocument) of existing files
  for file, index in plunk.files
    oldFiles[file.filename] = file

  # For each change proposed in the json
  for filename, file of json.files

    # Attempt to delete
    if file is null
      if old = oldFiles[filename]
        changes.push
          pn: filename
          pl: old.content

        # The old file may be a subdocument (when updating) OR a simple field (when forking)
        # Handle both cases
        if old.remove? then oldFiles[filename].remove()
        else delete oldFiles[filename]

    # Modification to an existing file
    else if old = oldFiles[filename]
      chg =
        pn: old.filename
        fn: file.filename or old.filename

      if file.filename
        old.filename = file.filename
      if file.content?
        chg.pl = gdiff.patch_toText(gdiff.patch_make(file.content, old.content))
        old.content = file.content

      if chg.fn or file.filename
        changes.push(chg)

    # New file; handle only if content provided
    else if file.content
      changes.push
        fn: filename
        pl: file.content
      plunk.files.push
        filename: filename
        content: file.content

  changes

applyTagsDeltaToPlunk = (plunk, json) ->
  changes = []

  if json.tags
    plunk.tags ||= []

    for tagname, add of json.tags
      if add
        plunk.tags.push(tagname)  if (idx = plunk.tags.indexOf(tagname)) < 0
      else
        plunk.tags.splice(idx, 1) if (idx = plunk.tags.indexOf(tagname)) >= 0

  changes




exports.loadPlunk = loadPlunk = (id, cb) ->
  return cb() unless id and id.length

  Plunk.findById(id).populate("user", 'gravatar_id login service_id').populate("history.user", 'gravatar_id login service_id').exec (err, plunk) ->
    changed = false

    # Fix duplicate tags
    if plunk?.tags and _.uniq(plunk.tags).length != plunk.tags.length
      seen = []
      dups = []
      idx = plunk.tags.length - 1

      while idx >= 0
        tagname = plunk.tags[idx]

        unless 0 > seen.indexOf(tagname)
          dups.push(tagname)
          plunk.tags.splice(idx, 1)
        else seen.push(tagname)

        idx--

      changed ||= dups.length > 0

      if dups.length
        console.log "[INFO] Removing duplicate tags: #{dups.join(', ')} for #{id}"

    if changed then return plunk.save (err) ->
      console.log "[OK] Duplicate tags removed" unless err
      cb(err, plunk)

    if err then cb(err)
    else unless plunk then cb()
    else cb(null, plunk)


  return


exports.withPlunk = (req, res, next) ->
  loadPlunk req.params.id, (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else unless plunk then next(new apiErrors.NotFound)
    else
      req.plunk = plunk
      next()

  return

exports.ownsPlunk = (req, res, next) ->
  unless ownsPlunk(req.currentSession, req.plunk) then next(new apiErrors.NotFound)
  else next()

  return


exports.createListing = (config = {}) ->
  (req, res, next) ->
    options = config(req, res) if _.isFunction(config)
    options ||= {}

    options.baseUrl ||= "#{apiUrl}/plunks"
    options.query ||= {}

    page = parseInt(req.param("p", "1"), 10)
    limit = parseInt(req.param("pp", "8"), 10)

    # Filter on plunks that are visible to the active user
    unless options.ignorePrivate
      if req.currentUser
        options.query.$or = [
          'private': false
        ,
          user: req.currentUser._id
        ]
      else
        options.query.private = false
    else if options.onlyPublic
      options.query.private = false

    # Build the Mongoose Query
    query = Plunk.find(options.query)
    query.sort(options.sort or "-updated_at")
    query.select("-files") unless req.param("files") is "yes" # We exclude files from plunk listings
    query.select("-files.content") if req.param("file.contents") is "no"
    query.select("-history") # We exclude history from plunk listings
    query.populate("user", 'gravatar_id login service_id').paginate page, limit, (err, plunks, count, pages, current) ->

      if err then next(new apiErrors.DatabaseError(err))
      else
        res.links createLinksObject(options.baseUrl, current, pages, limit)
        res.json preparePlunks(req.currentSession, plunks)

      # Is a memory leak here?
      options = page = limit = null

    return


# Request handlers

exports.read = (req, res, next) ->
  loadPlunk req.params.id, (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else unless plunk then next(new apiErrors.NotFound)
    else if plunk

      unless req.param("nv")
        plunk.views++
        plunk.save()

      json = plunk.toJSON
        session: req.currentSession
        transform: preparePlunk
        virtuals: true
        getters: true

      json = revertTo json, parseInt(req.param("v"), 10) if req.param("v")

      res.json json

  return

exports.create = (req, res, next) ->
  event = createEvent("create", req.currentUser)

  plunk = populatePlunk(req.body, user: req.currentUser)
  plunk.history.push(event)

  if !req.currentUser and !plunk.private
    return next(new apiErrors.NotFound)

  saveNewPlunk plunk, (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else
      if !req.currentUser and req.currentSession and req.currentSession.keychain
        req.currentSession.keychain.push _id: plunk._id, token: plunk.token
        req.currentSession.save()

      json = plunk.toJSON
        session: req.currentSession
        transform: preparePlunk
        virtuals: true
        getters: true

      json.user = req.currentUser.toJSON() if req.currentUser
      json.history[json.history.length - 1].user = req.currentUser.toJSON() if req.currentUser

      res.json(201, json)

  return



exports.update = (req, res, next) ->
  return next(new Error("request.plunk is required for update()")) unless req.plunk

  event = createEvent "update", req.currentUser
  event.changes.push(e) for e in applyFilesDeltaToPlunk(req.plunk, req.body)
  event.changes.push(e) for e in applyTagsDeltaToPlunk(req.plunk, req.body)

  req.plunk.updated_at = new Date
  req.plunk.description = req.body.description if req.body.description
  req.plunk.user = req.currentUser._id if req.currentUser

  req.plunk.history.push(event)

  req.plunk.save (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else

      json = plunk.toJSON
        user: req.currentUser
        session: req.currentSession
        transform: preparePlunk
        virtuals: true
        getters: true

      json.history[json.history.length - 1].user = req.currentUser.toJSON() if req.currentUser

      res.json json

  return

exports.freeze = (req, res, next) ->
  return next(new Error("request.plunk is required for freeze()")) unless req.plunk

  json = req.plunk.toJSON
    user: req.currentUser
    session: req.currentSession
    transform: preparePlunk
    virtuals: true
    getters: true

  json = revertTo json, parseInt(req.param("v"), 10) if req.param("v")

  req.plunk.frozen_at = new Date
  req.plunk.frozen_version = if req.param("v") then parseInt(req.param("v"), 10) else req.plunk.history.length - 1

  req.plunk.save (err, plunk) ->
    json = plunk.toJSON
      session: req.currentSession
      transform: preparePlunk
      virtuals: true
      getters: true

    if err then next(new apiErrors.DatabaseError(err))
    else res.send 200, json

exports.unfreeze = (req, res, next) ->
  return next(new Error("request.plunk is required for freeze()")) unless req.plunk

  req.plunk.frozen_at = undefined
  req.plunk.frozen_version = undefined

  req.plunk.save (err, plunk) ->
    json = plunk.toJSON
      session: req.currentSession
      transform: preparePlunk
      virtuals: true
      getters: true

    if err then next(new apiErrors.DatabaseError(err))
    else res.send 200, json

exports.fork = (req, res, next) ->
  return next(new Error("request.plunk is required for update()")) unless req.plunk

  if !req.currentUser
    req.body.private = true # Force forked plunks to be private for unlogged users

  event = createEvent "fork", req.currentUser

  if req.apiVersion is 1
    json = req.plunk.toJSON()
    json.description = req.body.description if req.body.description
    json.private = req.body.private if req.body.private?

    event.changes.push(e) for e in applyFilesDeltaToPlunk(json, req.body)
    event.changes.push(e) for e in applyTagsDeltaToPlunk(json, req.body)

  else if req.apiVersion is 0
    json = req.body


  fork = populatePlunk(json, user: req.currentUser, parent: req.plunk)
  fork.history.push(evt) for evt in req.plunk.history
  fork.history.push(event)

  saveNewPlunk fork, (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else
      if !req.currentUser and req.currentSession and req.currentSession.keychain
        req.currentSession.keychain.push _id: plunk._id, token: plunk.token
        req.currentSession.save()

      json = plunk.toJSON
        session: req.currentSession
        transform: preparePlunk
        virtuals: true
        getters: true

      json.user = req.currentUser.toJSON() if req.currentUser
      json.history[json.history.length - 1].user = req.currentUser.toJSON() if req.currentUser

      res.json(201, json)

      # Update the forks of the parent after the request is sent
      # No big deal if the forks update fails
      req.plunk.forks.push(plunk._id)
      req.plunk.forked++
      req.plunk.save()

  return

exports.destroy = (req, res, next) ->
  return next(new Error("request.plunk is required for update()")) unless req.plunk

  if req.plunk.fork_of then loadPlunk req.plunk.fork_of, (err, parent) ->
    if parent
      parent.forks.remove(req.plunk.fork_of)
      parent.forked--
      parent.save()

  unless ownsPlunk(req.currentSession, req.plunk) then next(new apiErrors.NotFound)
  else req.plunk.remove ->
    res.send(204)

  return

calculateScore = (count = 0) ->
  score = 0

  while count > 0
    score += calculateScoreDelta(count - 1)
    count--

  score


calculateScoreDelta = (count = 0) ->
  baseIncrement = 1000 * 60 * 60 * 12 # The first vote will move the plunk forward 12 hours in time
  decayFactor = 1.2

  baseIncrement / Math.pow(decayFactor, count)


exports.setThumbed = (req, res, next) ->
  return next(new apiErrors.PermissionDenied) unless req.currentUser
  return next(new apiErrors.NotFound) unless 0 > req.plunk.voters.indexOf(req.currentUser._id)

  req.plunk.score ||= req.plunk.created_at.valueOf()
  req.plunk.thumbs ||= 0

  req.plunk.voters.addToSet(req.currentUser._id)
  req.plunk.score += calculateScoreDelta(req.plunk.thumbs)
  req.plunk.thumbs++

  req.plunk.save (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else res.json({ thumbs: plunk.get("thumbs"), score: plunk.score}, 201)

exports.unsetThumbed = (req, res, next) ->
  return next(new apiErrors.PermissionDenied) unless req.currentUser
  return next(new apiErrors.NotFound) if 0 > req.plunk.voters.indexOf(req.currentUser._id)

  unless 0 > req.plunk.voters.indexOf(req.currentUser._id)
    req.plunk.voters.remove(req.currentUser._id)
    req.plunk.score -= calculateScoreDelta(req.plunk.thumbs - 1)
    req.plunk.thumbs--

  req.plunk.save (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else res.json({ thumbs: plunk.get("thumbs"), score: plunk.score}, 200)


exports.setRemembered = (req, res, next) ->
  return next(new apiErrors.PermissionDenied) unless req.currentUser

  req.plunk.rememberers.addToSet(req.currentUser._id)

  req.plunk.save (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else res.json({ status: "OK" }, 201)

exports.unsetRemembered = (req, res, next) ->
  return next(new apiErrors.PermissionDenied) unless req.currentUser

  req.plunk.rememberers.remove(req.currentUser._id)

  req.plunk.save (err, plunk) ->
    if err then next(new apiErrors.DatabaseError(err))
    else res.json({ status: "OK" }, 200)
