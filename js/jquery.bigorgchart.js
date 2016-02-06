'use strict';

(function($) {

  $.fn.jOrgChart = function(options) {
    var opts = $.extend({}, $.fn.jOrgChart.defaults, options);

    switch (options) {
      case 'buildNode':
        return buildNode.apply(this, Array.prototype.splice.call(arguments, 1));
      case 'buildChildNode':
        return buildChildNode.apply(this, Array.prototype.splice.call(arguments, 1));
      case 'buildParentNode':
        return buildParentNode.apply(this, Array.prototype.splice.call(arguments, 1));
      case 'buildSiblingNode':
        return buildSiblingNode.apply(this, Array.prototype.splice.call(arguments, 1));
    }

    // build the org-chart
    var $chartContainer = $(this);
    var data = opts.data;
    var $chart = $("<div class='jOrgChart " + opts.chartClass + " chart-box'/>");
    buildNode(data, $chart, 0, opts);
    $chartContainer.append($chart);

    // build the chart-panel which includes all control buttons of org-chart
    var $snapshotBtn = $('<a>',
      {'class': 'export',
        'text': 'Export',
        'click': function() {
          if ($(this).children('.spinner').length > 0) {
            return false;
          }
          // lock the interface of org-chart and (todo)display loading status
          $chartContainer.append($('<div class="mask"><p>Processing...</p></div>'));

          var $that = $(this);

          var $orgchart = $('.jOrgChart' + (opts.chartClass !== '' ? '.' + opts.chartClass : ''));
            // firstly, clear up the offset generated by users' drag
            $orgchart.css({'top': 0, 'left': 0});
            $chartContainer.scrollLeft(0).scrollTop(0);
            html2canvas($orgchart[0], {
                'onrendered': function(canvas) {
                  $chartContainer.find('.mask').remove();
                  $chartContainer.siblings('.chart-preview' + (opts.chartClass !== '' ? '.' + opts.chartClass : ''))
                    .attr('href', canvas.toDataURL()).addClass('preview-show');
              }
            });

        }
      }
    );
    var $previewBtn = $('<a>', {
      'class': 'chart-preview' + (opts.chartClass !== '' ? ' ' + opts.chartClass : ''),
      'text': 'Preview the picture',
      'target': '_blank',
        'click': function() {
          $(this).removeClass('preview-show');
        }
      }
    );
    var $panel = $('<div>',
      {'class': 'oc-panel' + (opts.chartClass !== '' ? ' ' + opts.chartClass : '')}
    );
    $chartContainer.after($panel.append($snapshotBtn)).after($previewBtn);

    $chart.on('mousedown mouseup mousemove mouseleave', '.node',function(event) {
      event.stopPropagation();
    });
    $chart.on('mousedown', function(event) {
      var $this = $(this);
      $this.data('offset', {
        'x': event.pageX - $this.offset().left,
        'y': event.pageY - $this.offset().top
      });
      var handlers = {
        mousemove : function(event){
          var $this = $(this);
          var $container = $this.parent();
          var pbmLeft = parseFloat($container.css('padding-left')) + parseFloat($container.css('border-left'))
            + parseFloat($container.css('margin-left'));
          var pbmTop = parseFloat($container.css('padding-top')) + parseFloat($container.css('border-top'))
            + parseFloat($container.css('margin-top'));
          $this.css({
            'left': event.pageX - $this.data('offset').x - pbmLeft,
            'top': event.pageY - $this.data('offset').y - pbmTop
          });
        },
        mouseup : function(){
          $(this).off(handlers);   
        },
        mouseleave: function() {
          $(this).off(handlers);
        }
      };
      $this.on(handlers);
    });

    if (opts.create) {
      opts.create();
    }
  };

  // Option defaults
  $.fn.jOrgChart.defaults = {
    depth: -1,
    chartClass: '',
    draggable: false
  };

  // determin whether the parent node of the specified node is visible on current chart view
  function getParentState($node) {
    if ($node.children('.spinner').length > 0) {
      return {};
    }
    var $parent = $node.closest('table').parent();
    if ($parent.is('td')) {
      if ($parent.closest('tr').siblings().is(':visible')) {
        return {"exist": true, "visible": true};
      }
      return {"exist": true, "visible": false};
    }
    return {"exist": false, "visible": false};
  }
  function getChildrenState($node) {
    if ($node.children('.spinner').length > 0) {
      return {};
    }
    var $children = $node.closest('tr').siblings();
    if ($children.length > 0) {
      if ($children.is(':visible')) {
        return {"exist": true, "visible": true};
      }
      return {"exist": true, "visible": false};
    }
    return {"exist": false, "visible": false};
  }
  function getSiblingsState($node) {
    if ($node.children('.spinner').length > 0) {
      return {};
    }
    var $siblings = $node.closest('table').parent('td').siblings();
    if ($siblings.length > 0) {
      if ($siblings.is(':visible')) {
        return {"exist": true, "visible": true};
      }
      return {"exist": true, "visible": false};
    }
    return {"exist": false, "visible": false};
  }

  // recursively hide the ancestor node and sibling nodes of the specified node
  function hideAncestorsSiblings($node, dtd) {
    var $nodeContainer = $node.closest('table').parent();
    if ($nodeContainer.parent().siblings('.node-cells').find('.spinner').length > 0) {
      $node.closest('div.jOrgChart').data('inAjax', false);
    }
    // firstly, hide the sibling nodes
    if (getSiblingsState($node).visible) {
      hideSiblings($node, false);
    }
    // hide the links
    var $temp = $nodeContainer.parent().siblings();
    var $links = $temp.slice(1);
    $links.css('visibility', 'hidden');
    // secondly, hide the superior nodes with animation
    var nodeOffset = $links.eq(0).outerHeight() + $links.eq(1).outerHeight();
    var $parent = $temp.eq(0).find('div.node');
    var grandfatherVisible = getParentState($parent).visible;
    if ($parent.length > 0 && $parent.is(':visible')) {
      $parent.animate({'opacity': 0, 'top': +nodeOffset}, 300, function() {
        $parent.removeAttr('style');
        $links.removeAttr('style');
        $temp.hide();
        if ($parent.closest('table').parent().is('.jOrgChart') || !grandfatherVisible) {
          dtd.resolve();
        }
      });
    }
    // if the current node has the parent node, hide it recursively
    if ($parent.length > 0 && grandfatherVisible) {
      hideAncestorsSiblings($parent, dtd);
    }

    return dtd.promise();
  }

  // show the parent node of the specified node
  function showAncestorsSiblings($node) {
    var dtd = $.Deferred();
    // just show only one superior level
    var $temp = $node.closest('table').closest('tr').siblings().show();

    // just show only one link
    $temp.eq(2).children().slice(1, $temp.eq(2).children().length - 1).hide();
    dtd.resolve();
    // show the the only parent node with animation
    $temp.eq(0).find('div.node')
      .animate({'opacity': 1, 'top': 0}, 300, function() {
        $(this).removeAttr('style');

      });

    return dtd.promise();
  }

  // recursively hide the descendant nodes of the specified node
  function hideDescendants($node) {
    var dtd = $.Deferred();
    if ($node.closest('tr').siblings(':last').find('.spinner').length > 0) {
      $node.closest('div.jOrgChart').data('inAjax', false);
    }
    var $links = $node.closest('tr').siblings(':lt(2)');
    $links.css('visibility', 'hidden');
    var nodeOffset = $links.eq(0).outerHeight() + $links.eq(1).outerHeight();
    $.when(
      $node.closest('tr').siblings(':last').find('div.node')
      .animate({'opacity': 0, 'top': -nodeOffset}, 300)
    )
    .done(function() {
      $links.removeAttr('style');
      $node.closest('tr').siblings().hide();
      dtd.resolve();
    });

    return dtd.promise();
  }

  // show the children nodes of the specified node
  function showDescendants($node) {
    var dtd = $.Deferred();
    // firstly, just show the only one inferior level of the child nodes
    var $temp = $node.closest('tr').siblings().show();
    dtd.resolve();
    // secondly, display the child nodes with animation
    var isLeaf = $temp.eq(2).children('td').length > 1 ? true : false;
    var $children = isLeaf ? $temp.eq(2).find('div.node') :
      $temp.eq(2).find('tr:first').find('div.node');
    $.when(
       $children.animate({'opacity': 1, 'top': 0}, 300)
     )
    .done(function() {
      $children.removeAttr('style');
    });
    // lastly, remember to hide all the inferior nodes of child nodes of current node
    $children.each(function(index, child){
      $(child).closest('tr').siblings().hide();
    });

    return dtd.promise();
  }

  function attachAnimationToSiblings(justSiblings, $siblings, offset, dtd) {
    if ($siblings.length > 0) {
      $.when(
        $siblings.find('div.node')
          .animate({'opacity': 0, 'left': offset}, 300)
      )
      .done(function() {
        $siblings.hide();
        if (justSiblings) {
          $siblings.closest('.jOrgChart').css('opacity', 0);// hack for firefox
        }
        $siblings.parent().prev().prev().removeAttr('style');
        var $temp = $siblings.parent().prev().children();
        $temp.eq(0).removeAttr('style');
        $temp.eq($temp.length - 1).removeAttr('style');
        dtd.resolve();
      });
    }
  }

  // hide the sibling nodes of the specified node
  function hideSiblings($node, justSiblings) {
    var dtd = $.Deferred();
    var $nodeContainer = $node.closest('table').parent();
    if ($nodeContainer.siblings().find('.spinner').length > 0) {
      $node.closest('div.jOrgChart').data('inAjax', false);
    }
    var nodeOffset = $node.outerWidth();
    // firstly, hide the links but take up space
    var $upperLink = $nodeContainer.parent().prev().prev();
    $upperLink.css('visibility', 'hidden')
    var $temp = $nodeContainer.parent().prev().children();
    $temp.slice(1, $temp.length -1).hide();
    $temp.eq(0).css('visibility', 'hidden');
    $temp.eq($temp.length - 1).css('visibility', 'hidden');
    // secondly, hide the sibling nodes with animation simultaneously
    attachAnimationToSiblings(justSiblings, $nodeContainer.prevAll(), +nodeOffset, dtd);
    attachAnimationToSiblings(justSiblings, $nodeContainer.nextAll(), -nodeOffset, dtd);

    return dtd.promise();
  }

  // show the sibling nodes of the specified node
  function showSiblings($node) {
    var dtd = $.Deferred();
    // firstly, show the sibling td tags
    var $siblings = $node.closest('table').parent().siblings().show();
    // secondly, show the links
    var $parent = $node.closest('table').closest('tr').siblings();
    var $lowerLinks = $parent.eq(2).children();
    $lowerLinks.slice(1, $lowerLinks.length -1).show();
    // thirdly, do some cleaning stuff
    if ($node.children('.topEdge').data('parentState').visible) {
      $siblings.each(function(index, sibling){
        $(sibling).find('div.node').closest('tr').siblings().hide();
      });
    } else {
      $parent.show();
    }
    dtd.resolve();
    // lastly, show the sibling nodes with animation
    $siblings.find('div.node').animate({'opacity': 1, 'left': 0}, 300);

    return dtd.promise();
  }

  // start up loading status for requesting new nodes
  function startLoadingStatus($arrow, $node, options) {
    var $chart = $node.closest('div.jOrgChart');
    if (typeof $chart.data('inAjax') !== 'undefined' && $chart.data('inAjax') === true) {
      return false;
    }

    $arrow.hide();
    $node.spin({'color': '#0071BD'});
    $node.children().not('.spinner').css('opacity', 0.2);
    var $exportButton = $('.oc-panel' + (options.chartClass !== '' ? '.' + options.chartClass : ''))
      .find('.oc-btn.export');
    $exportButton.spin({
      'color': '#fff',
      'radius': $exportButton.innerHeight()/6,
      'length': $exportButton.innerHeight()/6,
      'lines': 9
    });
    $chart.data('inAjax', true);
    return true;
  }

  // terminate loading status for requesting new nodes
  function endLoadingStatus($arrow, $node, options) {
    var $chart = $node.closest('div.jOrgChart');
    $arrow.show();
    $node.spin(false);
    $node.children().removeAttr('style');
    var $exportButton = $('.oc-panel' + (options.chartClass !== '' ? '.' + options.chartClass : ''))
      .find('.oc-btn.export');
    $exportButton.spin(false);
    $chart.data('inAjax', false);
  }

  // adjust the org-chart's position after user expanded/collapsed nodes
  function adjustPosition($node, originalPosition, currentPosition) {
    var chartWrapper = $node.closest('div.jOrgChart');
    var wrapperOffset = chartWrapper.offset();
    var topOffset = currentPosition.top - originalPosition.top;
    var leftOffset = currentPosition.left - originalPosition.left;
    $node.closest('div.jOrgChart').offset({
      'top': wrapperOffset.top - topOffset,
      'left': wrapperOffset.left - leftOffset
    });
  }

  // whether the cursor is hovering over the node
  function isInAction($node) {
    return $node.children('.edge').attr('class').indexOf('glyphicon-') > -1 ? true : false;
  }

  function switchUpDownArrow($arrow) {
    $arrow.toggleClass('glyphicon-chevron-up').toggleClass('glyphicon-chevron-down');
  }

  function collapseArrow($node) {
    switchLeftRightArrow($node, false);
    $node.children('.topEdge')
      .removeClass('glyphicon-chevron-up').addClass('glyphicon-chevron-down');
    $node.children('.topEdge').data('parentState').visible = true;
  }

  function switchLeftRightArrow($node, isExpand) {
    if (isExpand) {
      $node.children('.leftEdge')
        .removeClass('glyphicon-chevron-right').addClass('glyphicon-chevron-left');
      $node.children('.rightEdge')
        .removeClass('glyphicon-chevron-left').addClass('glyphicon-chevron-right');
    } else {
      $node.children('.leftEdge')
        .removeClass('glyphicon-chevron-left').addClass('glyphicon-chevron-right');
      $node.children('.rightEdge')
        .removeClass('glyphicon-chevron-right').addClass('glyphicon-chevron-left');
    }
  }

  // read property value frome the predefined data structure of node provided by hlin
  function readProperty(obj, keyArray) {
    if (!!!obj) {
      return '';
    } else if (keyArray.length === 1) {
      return obj[keyArray[0]];
    }
    return readProperty(obj[keyArray[0]], keyArray.slice(1));
  }

  // create node
  function createNode(nodeData, opts) {
    // construct the content of node
    var isEmployee = opts.chartClass.indexOf('employee') > -1 ? true : false;
    var $nodeTitle = $('<div class="title">')
      .text(readProperty(nodeData, opts.nodeTitle));
    var $nodeContent = $('<div class="content">');
    $nodeContent.text(readProperty(nodeData, opts.nodeContent));
    var $nodeDiv = $('<div>', {'id': nodeData[opts.nodeID]})
      .addClass('node')
      .append($nodeTitle).append($nodeContent);
    // append 4 directions arrows
    if (nodeData.relationship.parent_num > 0) {
      $nodeDiv.append('<a class="edge topEdge glyphicon"></a>');
    }
    if(nodeData.relationship.sibling_num > 0) {
      $nodeDiv.append('<a class="edge rightEdge glyphicon"></a>' +
        '<a class="edge leftEdge glyphicon"></a>');
    }
    if(nodeData.relationship.children_num > 0) {
      $nodeDiv.append('<a class="edge bottomEdge glyphicon"></a>');
    } else {
      $nodeDiv.addClass('oc-leaf');
    }

    // define hover event handler
    $nodeDiv.on('mouseenter mouseleave', function(event) {
      var $node = $(this);
      var $edge = $node.children('.edge');
      var $topEdge = $node.children('.topEdge');
      var $rightEdge = $node.children('.rightEdge');
      var $bottomEdge = $node.children('.bottomEdge');
      var $leftEdge = $node.children('.leftEdge');
      var temp;
      if (event.type === 'mouseenter') {
        if ($topEdge.length) {
          temp = getParentState($node);
          if (!$.isEmptyObject(temp)) {
            $topEdge.data('parentState', temp);
          }
          if ($topEdge.data('parentState').visible) {
            $topEdge.removeClass('glyphicon-chevron-up').addClass('glyphicon-chevron-down');
          } else {
            $topEdge.removeClass('glyphicon-chevron-down').addClass('glyphicon-chevron-up');
          }
        }
        if ($bottomEdge.length) {
          temp = getChildrenState($node);
          if (!$.isEmptyObject(temp)) {
            $bottomEdge.data('childrenState', temp);
          }
          if($bottomEdge.data('childrenState').visible) {
            $bottomEdge.removeClass('glyphicon-chevron-down').addClass('glyphicon-chevron-up');
          } else {
            $bottomEdge.removeClass('glyphicon-chevron-up').addClass('glyphicon-chevron-down');
          }
        }
        if ($leftEdge.length) {
          temp = getSiblingsState($node);
          if (!$.isEmptyObject(temp)) {
            $rightEdge.data('siblingsState', temp);
            $leftEdge.data('siblingsState', temp);
          }
          if($leftEdge.data('siblingsState').visible) {
            switchLeftRightArrow($node, false);
          } else {
            switchLeftRightArrow($node, true);
          }
        }
      } else {
        $topEdge.add($bottomEdge).removeClass('glyphicon-chevron-up glyphicon-chevron-down');
        $rightEdge.add($leftEdge).removeClass('glyphicon-chevron-right glyphicon-chevron-left');
      }
    });

    // define click event handler
    $nodeDiv.on('click', function(event) {
      var $node = $(this);
      $node.closest('.jOrgChart').find('.focused').removeClass('focused');
      $node.addClass('focused');
    });

    // define click event handler for the top edge
    $nodeDiv.children('.topEdge').on('click', function(event) {
      var $that = $(this);
      var $node = $that.parent();
      var parentState = $that.data('parentState');
      var originalPosition = $node.offset();
      var currentPosition;
      if ($node.children('.spinner').length > 0) {
        return false;
      }
      if (parentState.exist) {
        if ($node.closest('table').closest('tr').siblings(':first').find('div.node').is(':animated')) {
          return ;
        }
        // hide the ancestor nodes and sibling nodes of the specified node
        if (parentState.visible) {
          var dtd = $.Deferred();
          $.when(hideAncestorsSiblings($node, dtd))
　　        .done(function(){
              currentPosition = $node.offset();
              adjustPosition($node, originalPosition, currentPosition);
              parentState.visible = false;
              if ($node.children('.leftEdge').length > 0) {
                $node.children('.leftEdge').data('siblingsState').visible = false;
                $node.children('.rightEdge').data('siblingsState').visible = false;
              }
              if (isInAction($node)) {
                switchUpDownArrow($that);
                switchLeftRightArrow($node, true);
              }
            })
　　        .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
        } // show the ancestors and siblings
        else {
          $.when(showAncestorsSiblings($node))
　　        .done(function(){
              currentPosition = $node.offset();
              adjustPosition($node, originalPosition, currentPosition);
              parentState.visible = true;
              switchUpDownArrow($that);
            })
　　        .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
        }
      } else {
        // load the new parent node of the specified node by ajax request
        var nodeId = $that.parent()[0].id;
        // start up loading status
        if (startLoadingStatus($that, $node, opts)) {
        // load new nodes
          $.ajax({
            "url": opts.ajaxURL.parent + nodeId + "/",
            "dataType": "json"
          })
          .done(function(data, textStatus, jqXHR) {
            if ($node.closest('div.jOrgChart').data('inAjax') === true) {
              if (!$.isEmptyObject(data)) {
                $.when(buildParentNode(data, $that.closest('table'), opts))
　　              .done(function(){
                    currentPosition = $node.offset();
                    adjustPosition($node, originalPosition, currentPosition);
                    parentState.visible = true;
                    if (isInAction($node)) {
                      switchUpDownArrow($that);
                    }
                  })
　　              .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
              }
              parentState.exist = true;
            }
            // terminate the loading status
            endLoadingStatus($that, $node, opts);
          })
          .fail(function(jqXHR, textStatus, errorThrown) {
            console.log(errorThrown);
            parentState.exist = true;
            // terminate the loading status
            endLoadingStatus($that, $node, opts);
          });
        }
      }
    });

    // bind click event handler for the bottom edge
    $nodeDiv.children('.bottomEdge').on('click', function(event) {
      var $that = $(this);
      var $node = $that.parent();
      var childrenState = $that.data('childrenState');
      var originalPosition = $node.offset();
      var currentPosition;
      if ($node.children('.spinner').length > 0) {
        return false;
      }
      if (childrenState.exist) {
        if ($node.closest('tr').siblings(':last').find('div.node').is(':animated')) {
          return ;
        }
        // hide the descendant nodes of the specified node
        if (childrenState.visible) {
          $.when(hideDescendants($node))
　　        .done(function(){
              currentPosition = $node.offset();
              adjustPosition($node, originalPosition, currentPosition);
              childrenState.visible = false;
              if (isInAction($node)) {
                switchUpDownArrow($that);
              }
            })
　　        .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
        } // show the descendants
        else {
          $.when(showDescendants($node))
　　        .done(function(){
              currentPosition = $node.offset();
              adjustPosition($node, originalPosition, currentPosition);
              childrenState.visible = true;
              switchUpDownArrow($that);
            })
　　        .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
        }
      } else {
        // load the new children nodes of the specified node by ajax request
        var nodeId = $that.parent()[0].id;
        if (startLoadingStatus($that, $node, opts)) {
          $.ajax({
            "url": opts.ajaxURL.children + nodeId + "/",
            "dataType": "json"
          })
          .done(function(data, textStatus, jqXHR) {
            if ($node.closest('div.jOrgChart').data('inAjax') === true) {
              if (data.children.length !== 0) {
                var siblingCount = data.children.length;
                var dtd = $.Deferred();
                var childCount = 0;
                $.when(buildChildNode(data, $that.closest('tbody'), false, opts, function() {
                  if (++childCount === siblingCount + 1) {
                    dtd.resolve();
                    return dtd.promise();
                  }
                }))
　　            .done(function(){
                  currentPosition = $node.offset();
                  adjustPosition($node, originalPosition, currentPosition);
                  childrenState.visible = true;
                  if (isInAction($node)) {
                    switchUpDownArrow($that);
                  }
                })
　　            .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
              }
              childrenState.exist = true;
            }
            endLoadingStatus($that, $node, opts);
          })
          .fail(function(jqXHR, textStatus, errorThrown) {
            console.log(errorThrown);
            childrenState.exist = true;
            endLoadingStatus($that, $node, opts);
          });
        }
      }
    });

    // bind click event handler for the left and right edges
    $nodeDiv.children('.leftEdge, .rightEdge').on('click', function(event) {
      var $that = $(this);
      var $node = $that.parent();
      var siblingsState = $that.data('siblingsState');
      var originalPosition = $node.offset();
      var currentPosition;
      if ($node.children('.spinner').length > 0) {
        return false;
      }
      if (siblingsState.exist) {
        if ($node.closest('table').parent().siblings().find('div.node').is(':animated')) {
          return ;
        }
        // hide the sibling nodes of the specified node
        if (siblingsState.visible) {
          $.when(hideSiblings($node, true))
　　        .done(function(){
              setTimeout(function() {
                currentPosition = $node.offset();
                adjustPosition($node, originalPosition, currentPosition);
                $node.closest('.jOrgChart').css('opacity', '');// hack for firefox
                siblingsState.visible = false;
                if (isInAction($node)) {
                  switchLeftRightArrow($node, true);
                }
              }, 0);
            })
　　        .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
        } // show the siblings
        else {
          $.when(showSiblings($node))
　　        .done(function(){
              currentPosition = $node.offset();
              adjustPosition($node, originalPosition, currentPosition);
              siblingsState.visible = true;
              collapseArrow($node);
            })
　　        .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
        }
      } else {
        // load the new sibling nodes of the specified node by ajax request
        var nodeId = $that.parent()[0].id;
        var withParent = !$that.siblings('.topEdge').data('parentState').exist;
        var url = (withParent) ? opts.ajaxURL.siblingWithParent : opts.ajaxURL.sibling;
        if (startLoadingStatus($that, $node, opts)) {
          $.ajax({
            "url": url + nodeId + "/",
            "dataType": "json"
          })
          .done(function(data, textStatus, jqXHR) {
            if ($node.closest('div.jOrgChart').data('inAjax') === true) {
              if (data.children.length !== 0) {
                $.when(buildSiblingNode(data, $that.closest('table'), opts))
　　            .done(function(){
                  currentPosition = $node.offset();
                  adjustPosition($node, originalPosition, currentPosition);
                  siblingsState.visible = true;
                  if (isInAction($node)) {
                    collapseArrow($node);
                  }
                })
　　            .fail(function(){ console.log('failed to adjust the position of org-chart!'); });
              }
              $node.children('.topEdge').data('parentState').exist = true;
              siblingsState.exist = true;
              if ($that.is('.leftEdge')) {
                $that.siblings('.rightEdge').data('siblingsState', {'exist': true, 'visible': true});
              } else {
                $that.siblings('.leftEdge').data('siblingsState', {'exist': true, 'visible': true});
              }
            }
            endLoadingStatus($that, $node, opts);
          })
          .fail(function(jqXHR, textStatus, errorThrown) {
            console.log(errorThrown);
            siblingsState.exist = true;
            endLoadingStatus($that, $node, opts);
          });
        }
      }
    });
    // remedy the defect of css transformation - right arrow can not be translated like left one
    $nodeDiv.children('.leftEdge').hover(
      function() {
        var $rightEdge = $(this).siblings('.rightEdge');
        if (!getSiblingsState($(this)).visible) {
          $rightEdge.addClass('rightEdgeTransitionToRight');
        } else {
          $rightEdge.addClass('rightEdgeTransitionToLeft');
        }
      },
      function() {
        $(this).siblings('.rightEdge')
          .removeClass('rightEdgeTransitionToRight rightEdgeTransitionToLeft');
      }
    );

    // allow user to append dom modification after finishing node create of jOrgChart 
    if (opts.createNode) {
      opts.createNode($nodeDiv, nodeData);
    }

    return $nodeDiv;
  }
  // recursively build the tree
  function buildNode (nodeData, $appendTo, level, opts, callback) {
    var $table = $("<table cellpadding='0' cellspacing='0' border='0'/>");
    var $tbody = $("<tbody/>");

    // Construct the node
    var $nodeRow = $("<tr/>").addClass("node-cells");
    var $nodeCell = $("<td/>").addClass("node-cell").attr("colspan", 2);
    var $childNodes = nodeData.children;
    if ($childNodes && $childNodes.length > 1) {
      $nodeCell.attr("colspan", $childNodes.length * 2);
    }
    var $nodeDiv = createNode(nodeData, opts);
    $nodeCell.append($nodeDiv);
    $nodeRow.append($nodeCell);
    $tbody.append($nodeRow);

    if ($childNodes && $childNodes.length > 0) {
      // recurse until leaves found (-1) or to the level specified
      var $childNodesRow;
      if (opts.depth == -1 || (level + 1 < opts.depth)) {
        var $downLineRow = $("<tr/>");
        var $downLineCell = $("<td/>").attr("colspan", $childNodes.length * 2);
        $downLineRow.append($downLineCell);

        // draw the connecting line from the parent node to the horizontal line
        var $downLine = $("<div></div>").addClass("down");
        $downLineCell.append($downLine);
        $tbody.append($downLineRow);

        // draw the horizontal lines
        var $linesRow = $("<tr/>");
        $.each($childNodes, function() {
          var $left = $("<td>&nbsp;</td>").addClass("right top");
          var $right = $("<td>&nbsp;</td>").addClass("left top");
          $linesRow.append($left).append($right);
        });

        // horizontal line shouldn't extend beyond the first and last child branches
        $linesRow.find("td:first").removeClass("top").end().find("td:last").removeClass("top");

        $tbody.append($linesRow);
        $childNodesRow = $("<tr/>");
        $.each($childNodes, function() {
          var $td = $("<td class='node-container'/>");
          $td.attr("colspan", 2);
          // recurse through children lists and items
          if (callback) {
            buildNode(this, $td, level + 1, opts, callback);
          } else {
            buildNode(this, $td, level + 1, opts);
          }
          $childNodesRow.append($td);
        });

      }
      $tbody.append($childNodesRow);
    }

    $table.append($tbody);
    $appendTo.append($table);

    // fire up callback every time of building up a node
    if (callback) {
      callback();
    }

  }

  // build the child nodes of specific node
  function buildChildNode (nodeData, $appendTo, isChildNode, opts, callback) {
    var $childNodes = nodeData.children;
    var $table, $tbody;
    if (isChildNode) {
      $table = $("<table cellpadding='0' cellspacing='0' border='0'/>");
      $tbody = $('<tbody/>');

      // create the node
      var $nodeRow = $("<tr/>").addClass("node-cells");
      var $nodeCell = $("<td/>").addClass("node-cell").attr("colspan", 2);
      var $nodeDiv = createNode(nodeData, opts);
      $nodeCell.append($nodeDiv);
      $nodeRow.append($nodeCell);
      $tbody.append($nodeRow);
    } else {
      $appendTo.children('tr:first').children('td:first')
        .attr('colspan', $childNodes.length * 2);
    }

    if ($childNodes && $childNodes.length > 0) {
      // recurse until leaves found (-1) or to the level specified
      var $downLineRow = $("<tr/>");
      var $downLineCell = $("<td/>").attr("colspan", $childNodes.length * 2);
      $downLineRow.append($downLineCell);

      // draw the connecting line from the parent node to the horizontal line
      $downLine = $("<div></div>").addClass("down");
      $downLineCell.append($downLine);
      if (isChildNode) {
        $tbody.append($downLineRow);
      } else {
        $appendTo.append($downLineRow);
      }

      // Draw the horizontal lines
      var $linesRow = $("<tr/>");
      $.each($childNodes, function() {
        var $left = $("<td>&nbsp;</td>").addClass("right top");
        var $right = $("<td>&nbsp;</td>").addClass("left top");
        $linesRow.append($left).append($right);
      });

      // horizontal line shouldn't extend beyond the first and last child branches
      $linesRow.find("td:first").removeClass("top").end().find("td:last").removeClass("top");

      if (isChildNode) {
        $tbody.append($linesRow);
      } else {
        $appendTo.append($linesRow);
      }

      var $childNodesRow = $("<tr/>");
      $.each($childNodes, function() {
        var $td = $("<td class='node-container'/>");
        $td.attr("colspan", 2);
        // recurse through children lists and items
        if (callback) {
          buildChildNode(this, $td, true, opts, callback);
        } else {
          buildChildNode(this, $td, true, opts);
        }
        $childNodesRow.append($td);
      });

      if (isChildNode) {
        $tbody.append($childNodesRow);
      } else {
        $appendTo.append($childNodesRow);
      }
    }

    if (isChildNode) {
      $table.append($tbody);
      $appendTo.append($table);
    }

    // fire up callback every time of building up a node
    if (callback) {
      callback();
    }

  }

  // build the parent node of specific node
  function buildParentNode(nodeData, $currentChart, opts) {
    var dtd = $.Deferred();
    var $table = $("<table cellpadding='0' cellspacing='0' border='0'/>");
    var $tbody = $('<tbody/>');

    // Construct the node
    var $nodeRow = $("<tr/>").addClass("node-cells");
    var $nodeCell = $("<td/>").addClass("node-cell").attr("colspan", 2);
    var $nodeDiv = createNode(nodeData, opts);
    $nodeCell.append($nodeDiv);
    $nodeRow.append($nodeCell);
    $tbody.append($nodeRow);

    // recurse until leaves found (-1) or to the level specified
    var $downLineRow = $("<tr/>");
    var $downLineCell = $("<td/>").attr("colspan", 2);
    $downLineRow.append($downLineCell);

    // draw the connecting line from the parent node to the horizontal line
    $downLine = $("<div></div>").addClass("down");
    $downLineCell.append($downLine);
    $tbody.append($downLineRow);


    // Draw the horizontal lines
    var $linesRow = $("<tr/>");
    var $left = $("<td>&nbsp;</td>").addClass("right top");
    var $right = $("<td>&nbsp;</td>").addClass("left top");
    $linesRow.append($left).append($right);

    // horizontal line shouldn't extend beyond the first and last child branches
    $linesRow.find("td:first").removeClass("top").end().find("td:last").removeClass("top");
    $tbody.append($linesRow);

    $currentChart.closest('div.jOrgChart')
      .prepend($table.append($tbody)).find('tbody:first')
      .append($('<tr/>').append($('<td class="node-container" colspan="2" />')
        .append($currentChart)));

    dtd.resolve();
    return dtd.promise();
  }

  // subsequent processing of build sibling nodes
  function subsequentProcess($target, siblingCount) {
    $target.parent().prevAll('tr:gt(0)').children('td')
      .attr('colspan', (siblingCount + 1) * 2)
      .end().next().children('td').eq(0)
      .after($('<td class="left top">&nbsp;</td><td class="right top">&nbsp;</td>'));
  }

  // build the sibling nodes of specific node
  function buildSiblingNode(nodeData, $currentChart, opts) {
    var dtd = $.Deferred();
    var siblingCount = nodeData.children.length;
    var insertPostion = (siblingCount > 1) ? Math.floor(siblingCount/2 - 1) : 0;
    // just build the sibling nodes for the specific node
    if ($currentChart.parent().is('td.node-container')) {
      var $parent = $currentChart.closest('tr').prevAll('tr:last');
      if ($parent.is(':hidden')) {
        $parent.show();
      }
      $currentChart.closest('tr').prevAll('tr:lt(2)').remove();
      var childCount = 0;
      buildChildNode(nodeData, $currentChart.closest('tbody'), false, opts, function() {
        if (++childCount === siblingCount + 1) {
          subsequentProcess($currentChart.closest('tbody').children('tr:last').children('td')
            .eq(insertPostion).after($currentChart.closest('td').unwrap()), siblingCount);
          dtd.resolve();
          return dtd.promise();
        }
      });
    } else { // build the sibling nodes and parent node for the specific ndoe
      var nodeCount = 0;
      buildNode(nodeData, $currentChart.closest('div.jOrgChart'), 0, opts,
        function() {
          if (++nodeCount === siblingCount + 1) {
            subsequentProcess($currentChart.next().children('tbody:first').children('tr:last')
              .children('td').eq(insertPostion).after($('<td class="node-container" colspan="2" />')
              .append($currentChart)), siblingCount);
            dtd.resolve();
            return dtd.promise();
        }
      });
    }

  }

})(jQuery);
