'use strict';
const patchGameProject = (data) => {
        const project = JSON.parse(new TextDecoder().decode(data));
        const stage = project.targets.find((target) => target.isStage);
        const scoreEntry = Object.entries(stage.variables)
          .find(([, variable]) => variable[0] === '分数');
        const scoreVariableId = scoreEntry && scoreEntry[0];
        const loopScoreVariableId = 'tsukuyomi-postgame-loop-score';
        const cycleRestartVariableId = 'tsukuyomi-postgame-cycle-restart';
        stage.variables[loopScoreVariableId] = ['轮回分数', 0];
        stage.variables[cycleRestartVariableId] = ['关卡轮换中', 0];

        const progressionTargets = new Set([
          'Stage',
          '地5',
          '障碍2',
          'fz',
          'feichuan',
          '切换场景柱子',
          '切换场景刀',
          '月人2'
        ]);
        const replaceScoreReporter = (value) => {
          if (!Array.isArray(value)) return;
          if (value[0] === 12 && value[1] === '分数') {
            value[1] = '轮回分数';
            value[2] = loopScoreVariableId;
            return;
          }
          value.forEach(replaceScoreReporter);
        };
        project.targets
          .filter((target) => progressionTargets.has(target.name))
          .forEach((target) => {
            Object.values(target.blocks).forEach((block) => {
              Object.values(block.inputs || {}).forEach(replaceScoreReporter);
            });
          });

        const scoreTarget = project.targets.find((target) => target.name === 'fen2');
        const scoreResetBlock = scoreTarget && scoreTarget.blocks.pJ;
        if (scoreResetBlock && scoreVariableId) {
          const preserveScoreBlockId = 'tsukuyomi-preserve-cycle-score';
          scoreResetBlock.inputs.VALUE = [3, preserveScoreBlockId, [10, '0']];
          scoreTarget.blocks[preserveScoreBlockId] = {
            opcode: 'operator_multiply',
            next: null,
            parent: 'pJ',
            inputs: {
              NUM1: [3, [12, '分数', scoreVariableId], [4, '0']],
              NUM2: [3, [12, '关卡轮换中', cycleRestartVariableId], [4, '0']]
            },
            fields: {},
            shadow: false,
            topLevel: false
          };
        }

        const flightTarget = project.targets.find((target) => target.name === 'feichua');
        if (flightTarget) {
          const flightBlocks = flightTarget.blocks;
          const upMovement = flightBlocks.sh;
          const downMovement = flightBlocks.sk;
          const upControl = flightBlocks.ay;
          const downControl = flightBlocks.et;
          if (upMovement && downMovement && upControl && downControl) {
            const upConditionId = 'tsukuyomi-flight-up-in-bounds';
            const upPositionId = 'tsukuyomi-flight-up-position';
            const upLimitId = 'tsukuyomi-flight-up-limit';
            const downConditionId = 'tsukuyomi-flight-down-in-bounds';
            const downPositionId = 'tsukuyomi-flight-down-position';
            const downLimitId = 'tsukuyomi-flight-down-limit';
            const upKeyCondition = upControl.inputs.CONDITION;
            const downKeyCondition = downControl.inputs.CONDITION;

            upControl.inputs.CONDITION = [2, upConditionId];
            downControl.inputs.CONDITION = [2, downConditionId];
            flightBlocks[upConditionId] = {
              opcode: 'operator_and',
              next: null,
              parent: 'ay',
              inputs: {
                OPERAND1: upKeyCondition,
                OPERAND2: [2, upLimitId]
              },
              fields: {},
              shadow: false,
              topLevel: false
            };
            flightBlocks[upLimitId] = {
              opcode: 'operator_lt',
              next: null,
              parent: upConditionId,
              inputs: {
                OPERAND1: [3, upPositionId, [4, '0']],
                OPERAND2: [1, [10, '64']]
              },
              fields: {},
              shadow: false,
              topLevel: false
            };
            flightBlocks[upPositionId] = {
              opcode: 'motion_yposition',
              next: null,
              parent: upLimitId,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            };
            flightBlocks[downConditionId] = {
              opcode: 'operator_and',
              next: null,
              parent: 'et',
              inputs: {
                OPERAND1: downKeyCondition,
                OPERAND2: [2, downLimitId]
              },
              fields: {},
              shadow: false,
              topLevel: false
            };
            flightBlocks[downLimitId] = {
              opcode: 'operator_lt',
              next: null,
              parent: downConditionId,
              inputs: {
                OPERAND1: [1, [10, '-108']],
                OPERAND2: [3, downPositionId, [4, '0']]
              },
              fields: {},
              shadow: false,
              topLevel: false
            };
            flightBlocks[downPositionId] = {
              opcode: 'motion_yposition',
              next: null,
              parent: downLimitId,
              inputs: {},
              fields: {},
              shadow: false,
              topLevel: false
            };

            upMovement.opcode = 'motion_changeyby';
            upMovement.next = null;
            upMovement.inputs = { DY: [1, [4, '6']] };
            upMovement.fields = {};
            downMovement.opcode = 'motion_changeyby';
            downMovement.next = null;
            downMovement.inputs = { DY: [1, [4, '-6']] };
            downMovement.fields = {};
          }
        }

        project.targets
          .filter((target) => target.name.startsWith('\u653b\u51fb\u5224\u5b9a'))
          .forEach((target, index) => {
            const followEntry = Object.entries(target.blocks).find(([, block]) => {
              if (block.opcode !== 'motion_goto') return false;
              const menuId = block.inputs.TO && block.inputs.TO[1];
              const menu = target.blocks[menuId];
              return menu && menu.fields.TO && menu.fields.TO[0] === '\u8f89\u591c';
            });
            if (!followEntry) return;
            const [followId, followBlock] = followEntry;
            const nextId = followBlock.next;
            const groundYId = `tsukuyomi-rhythm-ground-y-${index}`;
            followBlock.next = groundYId;
            target.blocks[groundYId] = {
              opcode: 'motion_sety',
              next: nextId,
              parent: followId,
              inputs: {
                Y: [1, [4, '-32']]
              },
              fields: {},
              shadow: false,
              topLevel: false
            };
            if (nextId && target.blocks[nextId]) {
              target.blocks[nextId].parent = groundYId;
            }
          });

        project.targets.forEach((target) => {
          Object.values(target.blocks).forEach((block) => {
            if (block.opcode !== 'operator_lt') return;
            if (!JSON.stringify(block).includes('"分数"')) return;
            if (!JSON.stringify(block.inputs.OPERAND2 || []).includes('10000')) return;
            block.inputs.OPERAND2 = [1, [10, '1000000000000']];
          });
        });

        if (typeof window !== 'undefined') window.__gameProjectPatchStatus = 'stable-stage-cycle-v8';
        // Runtime acknowledgements replace wall-clock guesses during a stage restart.
        const addBlock = (target, id, opcode, next, inputs = {}, fields = {}) => {
          target.blocks[id] = { opcode, next, parent: null, inputs, fields, shadow: false, topLevel: false };
        };
        const resetId = 'tsukuyomi-cycle-reset-ready';
        const readyId = 'tsukuyomi-cycle-start-ready';
        const moodId = 'tsukuyomi-cycle-mood';
        stage.variables[resetId] = ['轮回重置完成', 0];
        stage.variables[readyId] = ['轮回启动完成', 0];
        stage.variables[moodId] = ['轮回心情', 100];
        // Zero-second Scratch waits each yield a VM frame. They continue only when the engine resumes.
        const flag = stage.blocks.Dh;
        if (!flag || !scoreResetBlock || !scoreTarget.blocks.JB) throw new Error('Unsupported Kaguya project');
        flag.next = 'tsukuyomi-reset-yield-1';
        addBlock(stage, flag.next, 'control_wait', 'tsukuyomi-reset-yield-2', { DURATION: [1, [5, '0']] });
        addBlock(stage, 'tsukuyomi-reset-yield-2', 'control_wait', 'tsukuyomi-reset-ack', { DURATION: [1, [5, '0']] });
        addBlock(stage, 'tsukuyomi-reset-ack', 'data_setvariableto', null, { VALUE: [1, [10, '1']] }, { VARIABLE: ['轮回重置完成', resetId] });
        scoreTarget.blocks.JB.next = 'tsukuyomi-start-ack';
        addBlock(scoreTarget, 'tsukuyomi-start-ack', 'data_setvariableto', null, { VALUE: [1, [10, '1']] }, { VARIABLE: ['轮回启动完成', readyId] });
        // xl1 normally replenishes health at game start. A level cycle must retain the current health.
        const healthTarget = project.targets.find((target) => target.name === 'xl1');
        const healthReset = Object.entries(healthTarget.blocks).find(([, block]) => block.opcode === 'data_setvariableto' && block.fields.VARIABLE[0] === '心情值');
        if (!healthReset) throw new Error('Missing health reset');
        const [healthBlockId, healthBlock] = healthReset;
        healthBlock.inputs.VALUE = [3, 'tsukuyomi-health-choice', [10, '100']];
        addBlock(healthTarget, 'tsukuyomi-health-choice', 'operator_add', null, { NUM1: [3, 'tsukuyomi-health-keep', [4, '0']], NUM2: [3, 'tsukuyomi-health-fresh', [4, '0']] });
        addBlock(healthTarget, 'tsukuyomi-health-keep', 'operator_multiply', null, { NUM1: [3, [12, '轮回心情', moodId], [4, '0']], NUM2: [3, [12, '关卡轮换中', cycleRestartVariableId], [4, '0']] });
        addBlock(healthTarget, 'tsukuyomi-health-fresh', 'operator_multiply', null, { NUM1: [1, [4, '100']], NUM2: [3, 'tsukuyomi-health-normal', [4, '0']] });
        addBlock(healthTarget, 'tsukuyomi-health-normal', 'operator_subtract', null, { NUM1: [1, [4, '1']], NUM2: [3, [12, '关卡轮换中', cycleRestartVariableId], [4, '0']] });
        // Consistent ownership helps the compiler and tooling follow the new reporter graph.
        for (const target of [stage, scoreTarget, healthTarget]) {
          for (const [id, block] of Object.entries(target.blocks)) {
            if (block.next && target.blocks[block.next]) target.blocks[block.next].parent = id;
            for (const input of Object.values(block.inputs || {})) {
              if (typeof input[1] === 'string' && target.blocks[input[1]]) target.blocks[input[1]].parent = id;
            }
          }
        }
        return new TextEncoder().encode(JSON.stringify(project)).buffer;
      };
module.exports = patchGameProject;
