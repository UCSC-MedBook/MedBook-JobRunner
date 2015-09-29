var spawn = Npm.require('child_process').spawn;
var temp = Meteor.npmRequire('temp'); // TODO: is my manual cleanup enough?
var path = Npm.require('path');
var fs = Npm.require('fs');

function removeForce(path) {
  rm = spawn("rm", ["-rf", path]);

  rm.stdout.on("data", function (data) {
    console.log("stdout:", data);
  });
  rm.stderr.on("data", function (data) {
    console.log("stderr:", data);
  });
  rm.on("close", function (exitCode) {
    console.log("exited rm with code", exitCode);
  });
}

parsingFunctions.uncompressTarGz = function(compressedFile, helpers,
    jobDone) {
  // TODO: rewrite without callback-hell antipattern
  // TODO: delete these folders
  temp.mkdir('uncompressTarGz',
      Meteor.bindEnvironment(function(err, workingDir) {
    if (err) {
      helpers.onError("Internal error: " +
          "could not create working directory on server");
      jobDone();
      return;
    }

    console.log("workingDir:", workingDir);
    var compressedFileName = compressedFile.original.name;
    var compressedPath = path.join(workingDir, compressedFileName);
    var readStream = compressedFile.createReadStream('blobs');
    var writeStream = fs.createWriteStream(compressedPath);

    // write the compressed file to workingDir
    readStream.pipe(writeStream);
    writeStream.on("finish", Meteor.bindEnvironment(function () {
      helpers.setFileStatus("processing");

      // note: don't care about stdout (files listed on stderr)
      var errorArray = [];

      // spawn a process to decompress the tar file
      console.log("spawnning tar command");
      tar = spawn("tar", ["-zxvf", compressedFileName], { cwd: workingDir });
      tar.stderr.on("data", function (data) {
        // write all of that file to the errorArray
        errorArray.push(data.toString());
      });
      tar.on("close", Meteor.bindEnvironment(function (exitCode) {
        if (exitCode !== 0) {
          helpers.onError("Error while running tar job");
          jobDone();
        } else {
          // // remove compressed file
          // removeForce(compressedPath);

          // filter so we don't get empty lines or folders (end with '/')
          // then map over them to remove the "x " before each line
          var fileNames = _.map(_.filter(errorArray.join("").split("\n"),
                  function (consoleLine) {
                var hiddenFileMatches = consoleLine.match(/\/\./g);

                return consoleLine.length > 0 &&
                    consoleLine.slice(-1) !== "/" &&
                    hiddenFileMatches === null;
              }), function (consoleLine) {
                return consoleLine.substring(2);
              });

          // process each file
          _.each(fileNames, function (newFileName) {
            // NOTE: this kind of insert only works on the server
            var blobObject = Blobs.insert(path.join(workingDir, newFileName));

            // set some stuff about the new file
            blobObject.name(newFileName);
            var submissionId = compressedFile.metadata.submission_id;
            Blobs.update({_id: blobObject._id}, {
              $set: {
                "metadata.uncompressed_from_id": compressedFile._id,
                "metadata.user_id": compressedFile.metadata.user_id,
                "metadata.submission_id": submissionId,
              }
            });

            var wranglerFileId = WranglerFiles.insert({
              "submission_id": submissionId,
              "user_id": compressedFile.metadata.user_id,
              "blob_id": blobObject._id,
              "blob_name": newFileName,
              "status": "saving",
              "uncompressed_from_id": compressedFile._id,
            });

            var guessId = Jobs.insert({
              "name": "guessWranglerFileType",
              "user_id": compressedFile.metadata.user_id,
              "date_created": new Date(),
              "args": {
                "wrangler_file_id": wranglerFileId,
              },
            });

            Jobs.insert({
              "name": "parseWranglerFile",
              "user_id": compressedFile.metadata.user_id,
              "date_created": new Date(),
              "args": {
                "wrangler_file_id": wranglerFileId,
              },
              "prerequisite_job_id": guessId,
            });
          });

          helpers.setFileStatus("done");
          jobDone();

          // TODO: remove the compressed file from the submission?
        }
      }));
    }));
  }));
};
