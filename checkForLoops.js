//Check for circular loops
//We only do this on the server side, to not add to the page load time on the client

/**
 * Create dependency list and check for circular dependencies
 * Adapted from: https://gist.github.com/RubyTuesdayDONO/5006455
 */
Meteor.startup(function(){

  var sorted  = Verifier._sortedVerifiers, // sorted list of IDs ( returned value )
    verifiers = Verifier._verifiers,
    visited = {}; // hash: id of already visited node => true

  for(var verifier in verifiers){
    if(!verifiers.hasOwnProperty(verifier))continue;
    visit(verifier);
  }

  function visit(name,ancestors){
    if (!Array.isArray(ancestors)) ancestors = [];
    ancestors.push(name);
    visited[name] = true;

    var deps = verifiers[name].uses;
    for(var i = 0, len = deps.length; i < len; i++){
      var dep = deps[i];
      if (ancestors.indexOf(dep) >= 0)  // if already in ancestors, a closed chain exists.
        throw new Verifier.Error('500','Circular dependency "' +  dep + '" is required by "' + name + '": ' + ancestors.join(' -> '));

      // if already exists, do nothing
      if (visited[dep]) continue;
      visit(dep, ancestors.slice(0)); // recursive call
    }
    if(sorted.indexOf(name)<0) sorted.push(name);
  }

});
