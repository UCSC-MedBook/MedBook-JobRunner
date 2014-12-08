blobStore = new FS.Store.GridFS("blobs");

Blobs = new FS.Collection("blobs", {
    stores: [blobStore]
});

Jobs = new Meteor.Collection('Jobs');

Jobs.attachSchema(new SimpleSchema({
  name: {
    type: String,
    label: "name",
    max: 200
  },
  args: {
    type: [String],
    label: "Arguments"
  },
  state: {
    type: String,
    label: "State",
    defaultValue: "waiting",
  }
}));

makeJob = function (name, args, inputs, outputs) {
    Jobs.insert( { state: "waiting", name: name, args: args, inputs: inputs, outputs: outputs } );
}

 
