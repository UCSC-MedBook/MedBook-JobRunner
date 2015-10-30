Meteor.publish("allJobs", function () {
  return Jobs.find({});
});
