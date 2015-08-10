#Verifier

This package tries to bring an easy and performant way to check for permissions in Meteor.

## Set-up
### Add Fetchers
Fetchers fetch data objects from the database.
When using the verifier system you can set a full data object for a given key, or just the id.
If a verifier would require the full object, then a fetcher is used to get the fetcher from the id you've set.

Verifier.registerFetcher(name,fetcher)
With name being the key name, and fetcher a function that fetches the data. Usually this will just do a findOne on a Mongo collection.

Or you can define multiple fetchers at once with:
Verifier.registerFetchers(fetchers)
With fetchers being name-fetcher pairs.

### Add Verifiers
You can add a Verifier by using

Verifier.registerVerifier(name,verifier)
Name is the name of the verifier
A verifier has following fields:
#### implies
This is a list of verifiers that will run before this verifier runs, and therefore must also be true.

#### prefetch
This is a function that can fetch some additional data if it is not set by the user.
For example 

#### verify

Or multiple at once using:
Verifier.registerVerifiers(verifiers)
With verifiers being name-verifier pairs

### Add Default Values
You can set default values as literals, or as functions that will be executed when the data is required.

You can register default values with:
Verifier.setDefaultValue(name,value)
Name is the key for which you want to set a default value
Value can be a literal or a function

Or you can set multiple at once using:
Verifier.setDefaultValues(values)
With values being an object with name-value pairs

## Checking for permissions
You can check for permissions by entering data and defining which verifiers you want to run on this data.

You can also create a Verifier object that implements a fluent API.

The public API basically consists of 4 methods:
### set(key,value)
Sets the data for a given key.
If the value is not null, nan or undefined, the data is set to the given value.

### get(key)
In case no data is set and no default value is set, this will throw an error.
In case no data is set for this key and a default value exists, it will return the default value
In case the data is not an object with an _id field, and a fetcher exists, it will run the fetcher and replace the data with whatever the fetcher returns. 
However, if no data can be fetched (fetcher returns undefined, nan or null), it will throw an error.
Otherwise it will just return whatever data is set for the key

### getId(key)
This is the same as get, but it will not try to fetch the data and instead just return the data or if the data is an object with an _id field, it will return the _id.
If you only need the ID and not any other data, then use this method, as you avoid running fetchers unnecessarily.

### verify(verifiers)
Verifiers is the name of the verifier, or array of verifier names to run.
This method will generate a list of dependencies (implied methods) and run them.
If one of the verifiers fails (i.e. returns false), an error gets thrown


An example 
This would be the same as the code above: 
```js
Meteor.methods('postMessage',function(roomId){
    check(roomId,String);
    new Verifier()
            .set('user',Meteor.userId())
            .set('room',roomId)
            .verify(['canPostToRoom']);
});
```

The verify method is defined as:
verify(data,toVerify,options)
* data An object with the data (key-value pairs)
* toVerify The verifier name, or array of verifier names to run
* options The

Example
```js
Meteor.methods('postMessage',function(roomId){
    check(roomId,String);
    verify({user:Meteor.userId(),room:roomId},['canPostToRoom']);
});
```



### Alternative syntax


## Todo
* Write tests
* Decide how to handle the client-side. The code runs on the client-side, but usually fetchers will fail since data on the client is incomplete.
So it might not make sense to run the code on the client-side. However, a user can decide which verifiers he adds and runs on the client-side, so it might still be of value.
