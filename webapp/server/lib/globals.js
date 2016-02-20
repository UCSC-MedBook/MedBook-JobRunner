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
spawnCommand = function (command, args, cwd) {
  console.log("command:", command);
  if (args && !args.every(function (arg) {
        var type = typeof arg;
        console.log("arg, type:", arg, type);
        return type === "boolean" || type === "string" || type === "number";
      })) {
    return Q.reject(new Error("All arguments must be a boolean, string or number"));
  }

  var deferred = Q.defer();

  // TODO: what happens to stdout/stderr?
  var stdoutPath = path.join(cwd, "./stdout.log");
  var stdout = fs.openSync(stdoutPath, "a");
  var stderrPath = path.join(cwd, "./stderr.log");
  var stderr = fs.openSync(stderrPath, "a");
  var proc = spawn(command, args, {
    cwd: cwd,
    stdio: ["ignore", stdout, stderr]
  });

  proc.on("error", function (error) {
    console.log("job got on error", error);
    deferred.reject(new Error(command + " " + args.join(" ") + " in " +
        cwd + " encountered error " + error.message));
  });

  proc.on("exit", function(exitCode) {
    deferred.resolve({
      exitCode: exitCode,
      stdoutPath: stdoutPath,
      stderrPath: stderrPath,
    });
  });

  return deferred.promise;
};

getBlobTextSample = function (blob) {
  var deferred = Q.defer();

  var self = this;
  var blob_text_sample = "";
  var blob_line_count = 0;
  var characters = 250;
  var maxLines = 5;

  var bylineStream = byLine(blob.createReadStream("blobs"));
  bylineStream.on('data', function (lineObject) {
    blob_line_count++;
    if (blob_line_count <= maxLines) {
      blob_text_sample += lineObject.toString().slice(0, characters) + "\n";
    }
  });
  bylineStream.on('end', function () {
    deferred.resolve({
      blob_line_count: blob_line_count,
      blob_text_sample: blob_text_sample,
    });
  });
  bylineStream.on("error", function () {
    deferred.reject(new Error("Error getting blob text samplef"));
  });

  return deferred.promise;
};

getSetting = function (attribute) {
  var settings = Meteor.settings;
  if (!settings) {
    throw new Error("no settings file");
  }

  var value = settings[attribute];
  if (!value) {
    throw new Error(attribute + " not defined in settings file");
  }

  return value;
};

setBlobMetadata = function (blob, userId, otherMetadata) {
  if (!userId) {
    throw new Error("userId not provided to setBlobMetadata");
  }

  Blobs.update(blob._id, {
    $set: _.extend({
      "metadata.user_id": userId,
    }, otherMetadata)
  });
};

// NOTE: pass in the this object of the job function
// (so that we can get to this.job.user_id)
// ex. spawnedCommandFailedResolve.call(self, commandResult, deferred);
spawnedCommandFailedResolve = function (commandResult, deferred) {
  var stdout = Blobs.insert(commandResult.stdoutPath);
  var stderr = Blobs.insert(commandResult.stderrPath);
  setBlobMetadata(stdout, this.job.user_id);
  setBlobMetadata(stderr, this.job.user_id);

  deferred.resolve({
    result: "Error code " + commandResult.exitCode,
    blobs: [
      {
        name: "Command output (stdout)",
        blob_id: stdout._id
      },
      {
        name: "Command error output (stderr)",
        blob_id: stderr._id
      },
    ],
  });
};
