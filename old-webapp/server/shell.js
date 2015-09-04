var spawn = Npm.require('child_process').spawn;
var PassThrough = Npm.require('stream').PassThrough;

 
runshell =  function (job) {
    var name = job.name;
    var argArray = job.args;

    console.log('server, calling : ', name , ' with args ', argArray);


    //FS.debug = true;
    var newFile = new FS.File();
    newFile.name('ls_result.txt');
    newFile.type('text/plain');
    newFile.size(200); //TODO CFS needs to properly calculate size for streams if not provided; this dummy value makes things work for now
    newFile.metadata = {
              caption: 'Not again!',
              command: name,
              args: argArray
    };

    // Create a bufferable / paused new stream...
    var pt = new PassThrough();
    // run the command with the provided arguments
    var proc = spawn(name, argArray).stdout.pipe(pt);

    proc.on("close", function(code, signal) {
        console.log("close event ", job._id);
        Jobs.update({_id: job._id}, { $set: {state: code }});
    });
    proc.on("exit", function(code, signal) {
        console.log("exit event ", job._id);
        Jobs.update({_id: job._id}, { $set: {state: code }});
    });

    // Set the createReadStream...
    newFile.createReadStream = function() {
        return pt;
    };

    // Create a bufferable / paused new stream...
    var pt = new PassThrough();
    // run the command with the provided arguments
    spawn(name, argArray).stdout.pipe(pt);

    // Set the createReadStream...
    newFile.createReadStream = function() {
      return pt;
    };

    var fileObj = Blobs.insert(newFile);

    return fileObj._id;
}

Meteor.startup(function () {
    
    Meteor.methods({
      getCurrentTime: function () {
            console.log('on server, getCurrentTime called');
            return new Date();
      },

      runshell: runshell
      })
});
