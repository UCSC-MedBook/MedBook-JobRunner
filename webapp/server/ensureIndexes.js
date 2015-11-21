// TODO: switch to mokolodi1:helpers

Meteor.startup(function () {
  Genes._ensureIndex({ gene: 1 });
  Genes._ensureIndex({ synonym: 1 });
  Genes._ensureIndex({ previous: 1 });
});
