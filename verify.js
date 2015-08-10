/**
 * Constructor function for verifier
 * @param options see Verifier.DEFAULT_OPTIONS
 * @returns {Verifier}
 * @constructor
 */
Verifier = function Verifier(options){
  //Make sure we get a new instance if one accidentally forgets the new keyword
  if(!this instanceof Verifier) return new Verifier(options);

  //Initialize instance
  this._init(options);
}

/**
 * Shorthand way to verify some data
 * @param data key-value pairs of the data
 * @param toVerify array of the methods to verify
 * @param options verifier options + extra options:
 *  reset (boolean), true by default, this will clean the data of the verifier being cleaned
 *  You may want to keep the verifier data if you want to access the data it fetched
 *
 * @returns the verifier
 */
verify = function verify(data,toVerify,options){
  options = _.extend({reset:true},options);
  var verifier = new Verifier(options);
  for(var key in data){
    if(!data.hasOwnProperty(key))continue;
    verifier.set(key,data[key]);
  }
  verifier.verify(toVerify);
  if(!!options.reset){
    verifier.clean();
  }
  return verifier;
}


Verifier.Error = Meteor.makeErrorType(
  "Verifier.Error",
  function (error, reason, details) {
    var self = this;

    // String code uniquely identifying this kind of error.
    self.error = error || 412;

    // Optional: A short human-readable summary of the error. Not
    // intended to be shown to end users, just developers. ("Not Found",
    // "Internal Server Error")
    self.reason = reason || "Verification failed";

    // Optional: Additional information about the error, say for
    // debugging. It might be a (textual) stack trace if the server is
    // willing to provide one. The corresponding thing in HTTP would be
    // the body of a 404 or 500 response. (The difference is that we
    // never expect this to be shown to end users, only developers, so
    // it doesn't need to be pretty.)
    self.details = details;

    // This is what gets displayed at the top of a stack trace. Current
    // format is "Data not found [404]"
    self.message = self.reason + ' [' + self.error + ']';

    self.sanitizedError = new Meteor.Error(self.error, self.reason);

  }
);

/**
 * Static data
 * @type {{}}
 * @private
 */
Verifier._verifiers = {};
Verifier._fetchers = {};
Verifier._defaults = {};
Verifier._sortedVerifiers = [];

/**
 * Default options
 * @type {{}}
 */
Verifier.DEFAULT_OPTIONS = {optimizeFields:false};

/**
 * Register a list of default values
 * @param defaultValues
 */
Verifier.setDefaultValues = function setDefaultValues(values){
  for(var value in values){
    if(!values.hasOwnProperty(value))continue;
    Verifier.setDefaultValue(value,values[value]);
  }
}

/**
 * Register a list of default value
 * @param defaultValue
 */
Verifier.setDefaultValue = function setDefaultValue(name,value){
  Verifier._defaults[name] = value;
}

/**
 * Register a list of verifiers.
 * List is an object of name definition pairs
 * @param verifiers
 */
Verifier.registerVerifiers = function registerVerifiers(verifiers){
  for(var verifier in verifiers){
    if(!verifiers.hasOwnProperty(verifier))continue;
    verifiers[verifier].name = verifier;
    Verifier.registerVerifier(verifier,verifiers[verifier]);
  }
}

/**
 * Registers one verifier object
 * This also registers the inverse, with the name prefixed by an exclamation mark
 *
 * @param verifier verifier object matching VerifierSchema
 */
Verifier.registerVerifier = function registerVerifier(name,verifier){
  verifier = _.extend({implies:[],uses:[],impliedFor:[],fields:{},verify:function(){return true;}},verifier);
  verifier.name = name;
  verifier.uses = _.uniq(verifier.uses.concat(verifier.implies));
  Verifier._verifiers[verifier.name] = verifier;

  //add to implies and uses list
  for(var i = 0, len = verifier.impliedFor.length; i < len; i++){
    if(Verifier._verifiers.hasOwnProperty(verifier.impliedFor[i])){
      if(Verifier._verifiers[verifier.impliedFor[i]].uses.indexOf(name) === -1){
        Verifier._verifiers[verifier.impliedFor[i]].implies.push(name);
        Verifier._verifiers[verifier.impliedFor[i]].uses.push(name);
      }
    }
  }

  //Register invert function
  /*
  var invert = _.clone(verifier);
  invert.fn = function(){
    return !Verifier._verifiers[verifier.name].verify.call(this);
  }
  Verifier._verifiers['!'+verifier.name] = invert;
  */
}

/**
 * Register a list of fetchers.
 * @param fetchers list of fetchers, this is an object of key,function pairs
 */
Verifier.registerFetchers = function registerFetchers(fetchers){
  for(var fetcher in fetchers){
    if(!fetchers.hasOwnProperty(fetcher))continue;
    Verifier.registerFetcher(fetcher,fetchers[fetcher]);
  }
}

/**
 * Register a fetcher
 * @param name name of object to fetch (will fetch the name used in the 'set' method
 * @param fn the method fetcher
 */
Verifier.registerFetcher = function registerFetcher(name,fn){
  Verifier._fetchers[name] = fn;
}

Verifier.prototype = {
  // "private" methods

  /**
   * Clean all data (remove fetchers, data and reset flags)
   * Implements a fluid API (returns itself)
   * @returns {Verify}
   */
  _init : function _init(options){
    this._options = _.extend(Verifier.DEFAULT_OPTIONS,this._options || {},options || {});
    //The data set on this verifier
    this._data = {};
    //The data keys we have already fetched
    this._fetched = {};
    //The current fetch path (used to check for fetch loops)
    this._fetchPath = [];
    //The current verify path (used to check for fetch loops)
    this._verifyPath = [];
    //Cache results
    this._verifyResults = {};
    //Which fields to fetch
    this._fields = {};

    return this;
  },

  /**
   * Resets all data
   * @param options
   * @returns {*|Verify}
   * @private
   */
  clean: function clean(options){
    return this._init(options);
  },

  _setDefaultValueFor : function _setDefaultValueFor(key){
    var defaultValue = Verifier._defaults[key];
    if(defaultValue){
      if(_.isFunction(defaultValue)){
        this.set(key,defaultValue.call(this));
      }else{
        this.set(key,defaultValue);
      }
    }
  },

  _getFieldsFor : function _getFieldsFor(key){
    if(!this._options.optimizeFields || !this._fields[key] || this._fields[key].indexOf('*') > -1){
      return {};
    }else{
      return _.object(this._fields[key],Array.apply(null, Array(this._fields[key].length)).map(function () { return 1; }));
    }
  },

  /**
   * Tries to fetch the data, if a fetcher is set
   * Implements a fluid API (returns itself)
   * @throws If the fetcher couldn't fetch any data
   */
  _fetch : function _fetch(toFetch){
    var fetched;

    //Check if we can or need to fetch
    if(!Verifier._fetchers.hasOwnProperty(toFetch) || this._isFetched(toFetch)){
      if(this.isSet(toFetch)){
        return this._data[toFetch];
      }else{
        return;
      }
    }

    //Check for circular dependencies in fetchers
    if(this._fetchPath.indexOf(toFetch) > -1){
      throw "Circular dependency while fetching '" + toFetch + "', fetch path: '" + this._fetchPath.join(" -> ") +" -> "+toFetch;
    }

    //Fetch
    this._fetchPath.push(toFetch);
    try{
      fetched = Verifier._fetchers[toFetch].call(this,fields);
    }catch(err){
      throw new Meteor.Error(412,"Couldn't fetch data for "+toFetch+", error: "+err);
    }finally{
      this._fetchPath.pop();
    }

    if(fetched){
      this.set(toFetch,fetched);
      this._fetched[toFetch] = true;
    }

    return fetched;
  },

  /**
   * Expand verifiers to include all implied verifiers
   * @param verifiers the array of original verifiers to expand
   * @returns array of all verifiers
   */
  _expandVerifiers : function _expandVerifiers(verifiers){
    //Fetch a list of all the used verifiers for the given verifiers
    var uses = _.flatten(_.pluck(_.pick(Verifier._verifiers,verifiers),'uses'));
    var diff = _.without(uses,verifiers);
    if(diff.length){
      verifiers.unshift(diff);
      this._expandVerifiers(verifiers);
    }
  },

  _hasDefaultValue : function _hasDefaultValue(key){
    return Verifier._defaults.hasOwnProperty(key);
  },

  _isFetched : function _isFetched(key){
    return !!this._fetched[key];
  },

  /**
   * For the given list of verifiers, calculate all the required fields to fetch from the database
   * @param verifiers
   * @private
   */
  _calcFields : function _calcFields(verifiers){
      //Don't modify original verifier list from this.verify
      var safeVerifiers = _.clone(verifiers);
      //First get a list of all implied and used verifiers, so we can concatenate all requested fields of all verifiers
      this._expandVerifiers(safeVerifiers);

      //Get the field list of all relevant verifiers
      var verifierfields = _.pluck(_.pick(Verifier._verifiers,saveVerifiers),'fields');

      //Concatenate all fields
      var fields = {};
      for(var i = 0, len = verifierfields.length; i < len; i++){
        var fieldlist = verifierfields[i];
        for(var field in fieldlist){
          if(!fieldlist.hasOwnProperty(field))continue;

          //In case data is already fetched or set, check if we have need more fields (and therefore need to fetch)
          if(this._fields[field] && _.difference(fieldlist[field],this._fields[field]).length){
            this._fetched[field] = false;
          }
          fields[field] = (fields[field] || []).concat(fieldlist[field]);
        }
      }
      this._fields = fields;
  },

  _removeResult : function(verifier){
    delete this._verifyResults[verifier];
    var verified = _.pick(Verifier._verifiers,Object.keys(this._verifyResults));
    for(var verifier in verified){
      if(!verified.hasOwnProperty(verifier))continue;
      if(verified[verifier].uses.indexOf(verified) > -1){
        this._removeResult(verifier);
      }
    }
  },

  /**
   * Set some data
   * @param key
   * @param data
   * @param fetchFunc
   * @returns {Verify}
   * @private
   */
  set : function set(key,data){
    if(!_.isUndefined(data) && !_.isNaN(data) && !_.isNull(data)){
      this._data[key] = data;
      if(!_.isString(data) || !Verifier._fetchers.hasOwnProperty(key)){
        this._fetched[key] = true;
      }else{
        this._fetched[key] = false;
      }

      if(this._options.optimizeFields && !_.isString(data) && Verifier._fetchers.hasOwnProperty(key)){
        this._fields[key] = Object.keys(data);
      }
    }
    return this;
  },

  /**
   * Check whether a data item has been set
   * @param key
   * @returns {boolean}
   */
  isSet : function isSet(key){
    return !!this._data[key];
  },

  /**
   * Fetches and returns the data item
   * Fetching only happens when the data is not yet fetched and has a fetcher registered
   * @param key
   * @returns {*}
   */
  get : function get(key,dontThrow){
    if(!this._fetchPath.length && !this._verifyPath.length && dontThrow !== false){
      dontThrow = true;
    }else if(dontThrow !== true){
      dontThrow = false;
    }

    try{

      if(!this.isSet(key) || (this.isSet(key) && !this._isFetched(key))){
        if(!this._fetch(key)){
          if(this._hasDefaultValue(key)){
            this._setDefaultValueFor(key);
          }else{
            throw new Verify.Error(404,"Verifier "+ this._currentVerifier +" requires unresolvable data: "+key);
          }
        }
      }

    }catch(err){
      if(!dontThrow){
        throw err;
      }else{
        return;
      }
    }

    return this._data[key];
  },

  /**
   * Return only the ID of a fetched object, or in case the object is a literal or not fetched, just return whatever
   * is set
   * @param key
   * @param dontThrow
   * @returns {*}
   */
  getId : function getId(key,dontThrow){

    var data;
    if(!this.isSet(key) && Verifier._fetchers.hasOwnProperty(key)){
      data = this.get(key,dontThrow);
    }else{
      data = this._data[key];
    }

    if(_.isString(data) || !data._id)
      return data;
    else
      return data._id;
  },

  /**
   * Check if the list of verifiers verifies
   * @param verifiers
   * @returns {boolean}
   */
  verifies : function verifies(verifiers){
    try{
      this.verify(verifiers);
    }catch (e) {
      if (e instanceof Verifier.Error) {
        return false;
      } else {
        //Other type of error (e.g. circular dependency)
        throw e;
      }
    }
    return true;
  },

  /**
   * Verify
   * @returns {Verifier}
   */
  verify : function verify(verifiers){
    if(!Array.isArray(verifiers)){
      verifiers = [verifiers];
    }

    //This is called by the user, and not by a verifier calling this.verifies
    if(!this._verifyPath.length){
      //In case we want to optimize the fetched fields, calculate them
      if(this._options.optimizeFields){
        this._calcFields(verifiers);
      }
    }

    for(var i = 0, len = verifiers.length; i < len; i++){
      var verifies;
      var previousVerifier = this._currentVerifier;

      this._currentVerifier = Verifier._verifiers[verifiers[i]];
      if(!this._currentVerifier){
        throw "Verifier not found " + verifiers[i];
      }

      if(this._verifyResults.hasOwnProperty(this._currentVerifier.name)){
        continue;
      }

      if(this._verifyPath.indexOf(this._currentVerifier.name) > -1){
        throw "Circular dependency while verifying '" + this._currentVerifier.name + "', verify path: '" + this._verifyPath.join(" -> ") +" -> "+this._currentVerifier.name;
      }

      this._verifyPath.push(this._currentVerifier.name);

      this.verify(this._currentVerifier.implies);

      try{
        verifies = this._currentVerifier.verify.call(this);
        this._verifyResults[this._currentVerifier.name] = verifies;
      }finally{
        this._verifyPath.pop();
        this._currentVerifier = previousVerifier;
      }

      if(!verifies){
        throw new Verify.Error(412,"Verifier failed: "+this._currentVerifier)
      }

    }

    return this;
  }
}

