Jobs.allow( {
    insert: function() { return true;},
    remove: function() { return true;}
});

function pollJobs() {
     var runningJob = Jobs.findOne({state:"waiting"});
     if (runningJob) {
         Jobs.update({_id: runningJob._id}, { $set: { state: "running"}});
         runshell(runningJob);
     }
}


Meteor.startup(function () {
   Meteor.publish('allJobs', function () {
     return Jobs.find({});
   });

   Meteor.setInterval(pollJobs, 5000);


});
