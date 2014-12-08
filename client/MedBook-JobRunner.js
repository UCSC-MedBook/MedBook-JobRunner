
/*
  function touchJob() {
      Jobs.insert({state:"waiting", name: "touch", args: ["/tmp/touchhum"] });
  }
  */

  // counter starts at 0
  Session.setDefault("counter", 0);

  Template.hello.helpers({
    counter: function () {
      return Session.get("counter");
    },
    Jobs : function() {
       return Jobs.find();
    },

    settings: function () {
        return {
            collection: Jobs,
            rowsPerPage: 10,
            showFilter: true,
            fields: ['state', 'name', 'args']
        };
    }
  });

/*
  Template.hello.events({
    'click button': function () {
      // increment the counter when button is clicked
      Session.set("counter", Session.get("counter") + 1);
      // Meteor.call("runshell", "ps", ["ax"]);
      touchJob();
    }
  });
  */

  Meteor.subscribe("allJobs");
