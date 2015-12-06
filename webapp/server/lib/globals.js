// actual globals
Q = Meteor.npmRequire('q');
byLine = Meteor.npmRequire('byline');
ntemp = Meteor.npmRequire('temp').track();

path = Npm.require('path');
fs = Npm.require('fs');
spawn = Npm.require('child_process').spawn;
// gets the first part of a string, adds "..." at the end if greater than 50
// characters long
firstPartOfLine = function (line) {
  var maxLength = 50;
  var firstPart = line.substring(0, maxLength);
  if (firstPart !== line) {
    firstPart = firstPart.substring(0, maxLength - 3) + "...";
  }
  return firstPart;
};


/**
 * Wrap executing a command in a promise
 * @param  {string}                command command to execute
 * @param  {Array<string>} args    Arguments to the command.
 * @param  {string} cwd            The working directory to run the command in.
 * @return {Promise}               A promise for the completion of the command.
 */
// adapted from https://gist.github.com/Stuk/6226938
// NOTE: currently the stdout and stderr are ignored, but in the comments
// for the original gist there's a way to save them.
spawnCommand = function (command, args, cwd) {
  if (args && !args.every(function (arg) {
        var type = typeof arg;
        return type === "boolean" || type === "string" || type === "number";
      })) {
    return Q.reject(new Error("All arguments must be a boolean, string or number"));
  }

  var deferred = Q.defer();

  var proc = spawn(command, args, { cwd: cwd, stdio: ['ignore', 1, 2] });

  proc.on("error", function (error) {
    console.log("job got on error", error);
    deferred.reject(new Error(command + " " + args.join(" ") + " in " +
        cwd + " encountered error " + error.message));
  });
  proc.on("exit", function(code) {
    if (code !== 0) {
      console.log("job returned nonzero", code);
      deferred.reject(new Error(command + " " + args.join(" ") + " in " +
          cwd + " exited with code " + code));
    } else {
      deferred.resolve();
    }
  });

  return deferred.promise;
};
