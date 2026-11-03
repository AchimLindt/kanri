<!-- SPDX-FileCopyrightText: Copyright (c) 2022-2026 trobonox <hello@trobo.dev>, Khusyasy, gitoak, AchimLindt -->
<!-- -->
<!-- SPDX-License-Identifier: Apache-2.0 -->
<!--
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

<template>
  <Modal
    :blur-background="false"
    @closeModal="
      $emit('closeModal', columnID);
      titleEditing = false;
      taskAddMode = false;
      showCustomColorPopup = false;
      documentPendingRemoval = null;
      resetLinkForm();
      emitter.emit('columnDraggingOn');
    "
  >
    <template #content>
      <div class="relative flex h-[40rem] w-[36rem] flex-col pl-2">
        <!-- inline confirmation for removing a document; sits above the modal content, so no extra z-index juggling -->
        <div
          v-if="documentPendingRemoval"
          class="absolute -inset-y-4 -left-8 -right-6 z-10 flex items-center justify-center rounded-md bg-zinc-800/40 backdrop-blur-sm"
          @click.self="documentPendingRemoval = null"
        >
          <div
            class="bg-elevation-2 flex max-w-md flex-col gap-4 rounded-md p-6 shadow-lg"
          >
            <h2 class="text-xl font-bold">
              {{ $t("modals.editCard.documentRemoveTitle") }}
            </h2>
            <p>
              {{
                $t("modals.editCard.documentRemoveQuestion", {
                  name: documentDisplayName(documentPendingRemoval.path),
                })
              }}
            </p>
            <p class="text-dim-3 break-all text-sm">
              {{ documentPendingRemoval.path }}
            </p>
            <div class="flex flex-row flex-wrap items-center justify-end gap-3">
              <button
                class="text-accent-hover transition-button p-2"
                @click="documentPendingRemoval = null"
              >
                {{ $t("general.cancelAction") }}
              </button>
              <button
                class="bg-elevation-3 bg-elevation-3-hover transition-button rounded-md px-4 py-2"
                @click="confirmRemoveDocument(false)"
              >
                {{ $t("modals.editCard.documentRemoveDetach") }}
              </button>
              <button
                class="transition-button rounded-md bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                @click="confirmRemoveDocument(true)"
              >
                {{ $t("modals.editCard.documentRemoveDeleteFile") }}
              </button>
            </div>
          </div>
        </div>
        <div class="mb-4">
          <div class="flex flex-row items-start justify-between gap-12">
            <div
              class="relative -left-8 top-0 flex flex-row items-center gap-2"
            >
              <div @blur="showCustomColorPopup = false">
                <Tooltip direction="top" :label="$t('modals.editCard.tooltip')">
                  <template #trigger>
                    <button
                      class="size-7 rounded-full flex items-center justify-center"
                      :class="[isCustomColor ? '' : selectedColor]"
                      :style="{
                        'background-color': isCustomColor ? customColor : '',
                      }"
                      @click="showCustomColorPopup = !showCustomColorPopup"
                    >
                      <SwatchIcon
                        :class="[
                          'stroke-2',
                          'size-3.5',
                          isCustomColor ? getContrast(customColor) : '',
                        ]"
                      />
                    </button>
                  </template>
                </Tooltip>
                <div
                  v-if="showCustomColorPopup"
                  v-on-click-outside="() => (showCustomColorPopup = false)"
                >
                  <div
                    class="border-b-bg-primary absolute left-0 top-4 z-10 size-0 border-x-[12px] border-b-[20px] border-x-transparent"
                    @click="showCustomColorPopup = false"
                  />
                  <div
                    class="bg-primary border-elevation-1 absolute -left-4 top-8 z-20 flex flex-col gap-1 rounded-md border p-3"
                  >
                    <h2 class="mb-1 text-lg font-semibold">
                      {{ $t("modals.editCard.colorTitle") }}
                    </h2>
                    <div class="flex w-full flex-row gap-3">
                      <button
                        class="size-7 rounded-full bg-pink-600 py-1 pl-1.5 pr-1 hover:bg-pink-700"
                        @click="setCardColor(columnID, card?.id, 'bg-pink-600')"
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-pink-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="size-7 rounded-full bg-red-600 py-1 pl-1.5 pr-1 hover:bg-red-700"
                        @click="setCardColor(columnID, card?.id, 'bg-red-600')"
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-red-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="size-7 rounded-full bg-orange-600 py-1 pl-1.5 pr-1 hover:bg-orange-700"
                        @click="
                          setCardColor(columnID, card?.id, 'bg-orange-600')
                        "
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-orange-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="size-7 rounded-full bg-yellow-600 py-1 pl-1.5 pr-1 hover:bg-yellow-700"
                        @click="
                          setCardColor(columnID, card?.id, 'bg-yellow-600')
                        "
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-yellow-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="size-7 rounded-full bg-green-600 py-1 pl-1.5 pr-1 hover:bg-green-700"
                        @click="
                          setCardColor(columnID, card?.id, 'bg-green-600')
                        "
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-green-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="size-7 rounded-full bg-teal-600 py-1 pl-1.5 pr-1 hover:bg-teal-700"
                        @click="setCardColor(columnID, card?.id, 'bg-teal-600')"
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-teal-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="size-7 rounded-full bg-blue-600 py-1 pl-1.5 pr-1 hover:bg-blue-700"
                        @click="setCardColor(columnID, card?.id, 'bg-blue-600')"
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-blue-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="size-7 rounded-full bg-purple-600 py-1 pl-1.5 pr-1 hover:bg-purple-700"
                        @click="
                          setCardColor(columnID, card?.id, 'bg-purple-600')
                        "
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-purple-600'"
                          class="size-4"
                        />
                      </button>
                      <button
                        class="bg-elevation-2 bg-elevation-3-hover size-7 rounded-full py-1 pl-1.5 pr-1"
                        @click="
                          setCardColor(columnID, card?.id, 'bg-elevation-2')
                        "
                      >
                        <CheckIcon
                          v-if="selectedColor === 'bg-elevation-2'"
                          class="size-4"
                        />
                      </button>
                      <button
                        :class="`h-7 w-7 rounded-full py-1 pl-1.5 pr-1`"
                        :style="{ 'background-color': customColor }"
                        @click="setCardColor(columnID, card?.id, customColor)"
                      >
                        <CheckIcon
                          v-if="isCustomColor"
                          :class="['h-4', 'w-4', getContrast(customColor)]"
                        />
                        <SwatchIcon
                          v-else
                          :class="[
                            'stroke-2',
                            'h-4',
                            'w-4',
                            getContrast(customColor),
                          ]"
                        />
                      </button>
                    </div>
                    <div v-if="isCustomColor">
                      <h3 class="mb-1 mt-2 font-semibold">
                        {{ $t("modals.editCard.colorCustom") }}
                      </h3>
                      <div class="flex w-full flex-row gap-4">
                        <input
                          v-model="customColor"
                          class="w-20"
                          type="color"
                        />
                        <HexColorInput v-model="customColor" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <h1
                v-if="!titleEditing"
                :v-model="title"
                class="text-no-overflow pointer-events-auto min-w-[64px] max-w-[475px] pr-5 text-2xl font-bold"
                @click="enableTitleEditing()"
              >
                {{ title }}
              </h1>
              <textarea
                v-if="titleEditing"
                ref="titleTextArea"
                v-model="title"
                v-focus
                class="bg-elevation-2 text-normal border-accent-focus pointer-events-auto w-[450px] text-xl focus:border-2 focus:border-dotted focus:outline-none"
                maxlength="1000"
                type="text"
                @blur="updateTitle"
                @keypress.enter="updateTitle"
              />
            </div>
            <XMarkIcon
              class="text-accent-hover size-6 shrink-0 cursor-pointer"
              @click="
                $emit('closeModal', columnID);
                titleEditing = false;
                taskAddMode = false;
                showCustomColorPopup = false;
                resetLinkForm();
                emitter.emit('columnDraggingOn');
              "
            />
          </div>
          <div class="flex flex-row items-center gap-2">
            <VDatePicker
              v-model="dueDate"
              mode="dateTime"
              is24hr
              @update:modelValue="updateDueDate"
            >
              <template #default="{ togglePopover }">
                <button
                  class="bg-elevation-2 bg-elevation-3-hover mt-1 flex items-center justify-center gap-2 rounded-md px-2 py-1"
                  @click="() => togglePopover()"
                >
                  <PhCalendar class="size-5" />
                  <span v-if="dueDate"
                    >{{ $t("modals.editCard.dueDate")
                    }}{{ dateToLocalFormat(dueDate) }}</span
                  >
                  <span v-else>{{ $t("modals.editCard.dateSet") }}</span>
                </button>
              </template>
              <template #footer>
                <div class="w-full px-4 pb-3">
                  <div class="mt-2 flex flex-col gap-2">
                    <div class="flex flex-row items-center gap-6 mb-2">
                      <SwitchRoot
                        v-model:checked="isDueDateCounterRelative"
                        class="bg-elevation-2 bg-accent-checked relative flex h-[24px] w-[42px] cursor-pointer rounded-full shadow-sm focus-within:outline focus-within:outline-black"
                        @update:checked="updateDueDate"
                      >
                        <SwitchThumb
                          class="bg-button-text my-auto block size-[18px] translate-x-0.5 rounded-full shadow-sm transition-transform duration-100 will-change-transform data-[state=checked]:translate-x-[19px]"
                        />
                      </SwitchRoot>
                      <p>{{ $t("modals.editCard.countdown") }}</p>
                    </div>

                    <button
                      class="bg-elevation-1 bg-elevation-2-hover flex flex-row items-center justify-center gap-2 rounded-md px-2 py-1"
                      @click="resetDueDate"
                    >
                      <PhTrash class="mt-0.5 size-5" />
                      {{ $t("modals.editCard.dateRemove") }}
                    </button>
                    <button
                      class="bg-accent flex flex-row items-center justify-center gap-2 rounded-md px-2 py-1"
                      @click="isDueDateCompleted = !isDueDateCompleted; markDueDateCompleted()"
                    >
                      <PhCheck v-if="!isDueDateCompleted" class="mt-0.5 size-5" />
                      <PhX v-else class="mt-0.5 size-5" />
                      {{ isDueDateCompleted ? 'Mark Not Completed' : 'Set as Completed' }}
                    </button>
                  </div>
                </div>
              </template>
            </VDatePicker>
            <label
              v-if="dueDate"
              class="mt-1 flex flex-row items-center gap-2"
            >
              <PhBell class="size-5" />
              <span class="sr-only">{{ $t("modals.editCard.reminderLabel") }}</span>
              <select
                :value="reminderLeadTime"
                class="bg-elevation-2 bg-elevation-3-hover cursor-pointer rounded-md px-2 py-1"
                :title="$t('modals.editCard.reminderLabel')"
                @change="updateReminderLeadTime"
              >
                <option value="default">
                  {{ $t("modals.editCard.reminderDefault") }}
                </option>
                <option value="none">
                  {{ $t("modals.editCard.reminderNone") }}
                </option>
                <option value="1d">
                  {{ $t("modals.editCard.reminder1d") }}
                </option>
                <option value="3d">
                  {{ $t("modals.editCard.reminder3d") }}
                </option>
                <option value="7d">
                  {{ $t("modals.editCard.reminder7d") }}
                </option>
              </select>
            </label>
          </div>
        </div>

        <div class="overflow-auto">
          <div class="flex flex-col pr-6">
            <h2 class="text-lg font-semibold">
              {{ $t("modals.editCard.descriptionTitle") }}
            </h2>
            <KanbanDescriptionEditor
              v-model="description"
              @editorBlurred="updateDescription"
            />
          </div>
          <div>
            <div class="mb-1 mt-4 flex flex-row items-center gap-2">
              <h2 class="text-lg font-semibold">
                {{ $t("modals.editCard.taskTitle") }}
              </h2>
              <span v-if="tasks.length !== 0" class="text-dim-1 text-sm"
                >({{ getCheckedTaskNumber }}/{{ tasks.length }})</span
              >
            </div>
            <ProgressRoot
              v-if="tasks"
              v-model="getTaskPercentage"
              class="bg-elevation-2 relative mb-4 h-2 w-[96%] overflow-hidden rounded-full"
              style="transform: translateZ(0)"
            >
              <ProgressIndicator
                class="ease-[cubic-bezier(0.65, 0, 0.35, 1)] bg-accent-no-hover size-full rounded-full transition-transform duration-[660ms]"
                :style="`transform: translateX(-${100 - getTaskPercentage}%)`"
              />
            </ProgressRoot>
            <div class="flex w-full flex-col gap-1">
              <div
                v-if="tasks && tasks.length !== 0"
                class="flex max-h-[250px] w-[calc(100%-17px)] flex-col gap-4 overflow-auto pl-1 pr-4 resize-y"
              >
                <Container
                  drag-class="cursor-grabbing"
                  drag-handle-selector=".task-drag"
                  lock-axis="y"
                  orientation="vertical"
                  @drop="onTaskDrop"
                  :get-child-payload="(index: number) => tasks[index]"
                >
                  <Draggable
                    v-for="(task, index) in tasks"
                    :key="task.id"
                    :class="draggingEnabled ? 'task-drag' : 'nomoredragging'"
                    :index="index"
                  >
                    <div
                      class="mb-1 flex w-full flex-row items-center justify-between gap-4"
                    >
                      <div
                        class="flex w-full flex-row items-center justify-start gap-4"
                      >
                        <CheckboxRoot
                          v-model:checked="task.finished"
                          class="bg-elevation-4 bg-elevation-2-hover border-elevation-5 flex size-5 shrink-0 appearance-none items-center justify-center rounded-[4px] border outline-none"
                          @update:checked="updateCardTasks()"
                        >
                          <CheckboxIndicator
                            class="flex size-full items-center justify-center rounded"
                          >
                            <PhCheck
                              weight="bold"
                              class="text-accent-lighter size-4"
                            />
                          </CheckboxIndicator>
                        </CheckboxRoot>
                        <input
                          v-if="
                            taskEditMode && index === currentlyEditingTaskIndex
                          "
                          v-model="currentlyEditingTaskName"
                          v-focus
                          class="bg-elevation-2 border-accent -mx-1.5 w-full rounded-md border-b-2 border-dotted px-1.5 py-0.5 outline-none"
                          type="text"
                          @blur="updateTask(index)"
                          @keypress.enter="updateTask(index)"
                        />
                        <ClickCounter
                          v-else
                          @double-click="enableTaskEditMode(index, task)"
                        >
                          <span class="text-no-overflow-task w-full">{{
                            task.name
                          }}</span>
                        </ClickCounter>
                      </div>
                      <div
                        class="ml-1 flex h-full shrink-0 flex-row items-end gap-1 self-center"
                      >
                        <button
                          v-if="!taskEditMode"
                          class="shrink-0"
                          @click="enableTaskEditMode(index, task)"
                        >
                          <PhPencilSimple
                            class="text-dim-2 text-accent-hover size-4"
                          />
                        </button>
                        <button
                          v-if="
                            taskEditMode && currentlyEditingTaskIndex === index
                          "
                          class="shrink-0"
                          @click="updateTask(index)"
                        >
                          <PhCheck
                            class="text-dim-2 text-accent-hover size-4"
                          />
                        </button>
                        <button
                          v-if="
                            !(
                              taskEditMode &&
                              currentlyEditingTaskIndex === index
                            )
                          "
                          class="shrink-0"
                          @click="deleteTask(index)"
                        >
                          <XMarkIcon
                            class="text-dim-2 text-accent-hover size-4"
                          />
                        </button>
                      </div>
                    </div>
                  </Draggable>
                </Container>
              </div>
              <input
                v-if="taskAddMode"
                ref="newTaskInput"
                v-model="newTaskName"
                v-focus
                class="bg-elevation-2 text-normal border-accent-focus pointer-events-auto w-[96%] rounded-md p-1 text-base focus:border-2 focus:border-dotted focus:outline-none"
                maxlength="1000"
                :placeholder="$t('modals.editCard.newTaskPlaceholder')"
                type="text"
                @keypress.enter="createTask"
              />
              <div v-if="taskAddMode" class="ml-0.5 mt-0.5 flex flex-row gap-4">
                <button
                  class="bg-accent text-buttons rounded-md px-4 py-1"
                  @click="createTask"
                >
                  {{ $t("general.addAction") }}
                </button>
                <button
                  @click="
                    taskAddMode = false;
                    newTaskName = '';
                  "
                >
                  {{ $t("general.cancelAction") }}
                </button>
              </div>
              <button
                v-if="!taskAddMode"
                class="bg-elevation-1 bg-elevation-2-hover mr-8 mt-1 flex h-min w-[96%] cursor-pointer flex-row items-center gap-2 rounded-md py-1 pl-0.5 pr-2"
                @click="enableTaskAddMode"
              >
                <PlusIcon class="text-accent size-6" />
                <span>{{ $t("modals.editCard.taskAdd") }}</span>
              </button>
            </div>
          </div>
          <div class="mt-4 flex flex-col pr-6">
            <h2 class="text-lg font-semibold">
              {{ $t("modals.editCard.documentsTitle") }}
            </h2>
            <div v-if="documents.length > 0" class="mt-1 flex flex-col gap-1">
              <ContextMenuRoot v-for="doc in documents" :key="doc.id">
                <ContextMenuTrigger as-child>
                  <button
                    class="bg-elevation-2-hover flex w-full flex-row items-center gap-2 rounded-md px-2 py-1 text-left"
                    :class="
                      isDocumentMissing(doc.id) ? 'cursor-default' : 'cursor-pointer'
                    "
                    :title="
                      isDocumentMissing(doc.id)
                        ? `${$t('modals.editCard.documentMissing')}: ${doc.path}`
                        : doc.path
                    "
                    @click="openDocument(doc)"
                  >
                    <PhWarning
                      v-if="isDocumentMissing(doc.id)"
                      class="size-5 shrink-0 text-red-500"
                    />
                    <PhFileText v-else class="text-dim-2 size-5 shrink-0" />
                    <span class="text-no-overflow-task">{{
                      documentDisplayName(doc.path)
                    }}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuPortal to=".default-layout">
                  <ContextMenuContent :class="documentContextMenuClass">
                    <ContextMenuItem
                      value="Open"
                      :disabled="isDocumentMissing(doc.id)"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5 data-[disabled]:cursor-default data-[disabled]:opacity-50"
                      @select="openDocument(doc)"
                    >
                      {{ $t("modals.editCard.documentOpen") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      value="Reveal"
                      :disabled="isDocumentMissing(doc.id)"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5 data-[disabled]:cursor-default data-[disabled]:opacity-50"
                      @select="revealDocument(doc)"
                    >
                      {{ $t("modals.editCard.documentReveal") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      value="Open external"
                      :disabled="isDocumentMissing(doc.id)"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5 data-[disabled]:cursor-default data-[disabled]:opacity-50"
                      @select="openDocumentExternally(doc)"
                    >
                      {{ $t("modals.editCard.documentOpenExternal") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      value="Relink"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
                      @select="relinkDocument(doc)"
                    >
                      {{ $t("modals.editCard.documentRelink") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      value="Remove"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
                      @select="removeDocument(doc)"
                    >
                      {{ $t("modals.editCard.documentRemove") }}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuPortal>
              </ContextMenuRoot>
            </div>
            <div class="mt-2 flex flex-row gap-2">
              <button
                class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1"
                @click="addExistingDocuments"
              >
                {{ $t("modals.editCard.documentsAddExisting") }}
              </button>
              <button
                class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1"
                @click="createNewDocument"
              >
                {{ $t("modals.editCard.documentsCreateNew") }}
              </button>
            </div>
          </div>
          <div class="mt-4 flex flex-col pr-6">
            <h2 class="text-lg font-semibold">
              {{ $t("modals.editCard.linksTitle") }}
            </h2>
            <div v-if="links.length > 0" class="mt-1 flex flex-col gap-1">
              <ContextMenuRoot v-for="link in links" :key="link.id">
                <ContextMenuTrigger as-child>
                  <button
                    class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center gap-2 rounded-md px-2 py-1 text-left"
                    :class="{ 'bg-elevation-2': link.id === editingLinkId }"
                    :title="link.url"
                    @click="openLink(link)"
                  >
                    <PhLink class="text-dim-2 size-5 shrink-0" />
                    <span class="text-no-overflow-task">{{
                      linkDisplayName(link)
                    }}</span>
                  </button>
                </ContextMenuTrigger>
                <ContextMenuPortal to=".default-layout">
                  <ContextMenuContent :class="documentContextMenuClass">
                    <ContextMenuItem
                      value="Open"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
                      @select="openLink(link)"
                    >
                      {{ $t("modals.editCard.linksOpen") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      value="Copy URL"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
                      @select="copyLinkUrl(link)"
                    >
                      {{ $t("modals.editCard.linksCopy") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      value="Edit"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
                      @select="startLinkEdit(link)"
                    >
                      {{ $t("modals.editCard.linksEdit") }}
                    </ContextMenuItem>
                    <ContextMenuItem
                      value="Remove"
                      class="bg-elevation-2-hover flex w-full cursor-pointer flex-row items-center rounded-md px-4 py-1.5"
                      @select="removeLink(link)"
                    >
                      {{ $t("modals.editCard.linksRemove") }}
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenuPortal>
              </ContextMenuRoot>
            </div>
            <div class="mt-2 flex flex-col gap-2">
              <input
                ref="linkUrlInput"
                v-model="linkUrlInputValue"
                class="bg-elevation-2 text-normal border-accent-focus w-full rounded-md p-1 text-base focus:border-2 focus:border-dotted focus:outline-none"
                maxlength="4000"
                :placeholder="$t('modals.editCard.linksUrlPlaceholder')"
                type="text"
                @input="linkError = ''"
                @keypress.enter="submitLink"
              >
              <input
                v-model="linkTitleInputValue"
                class="bg-elevation-2 text-normal border-accent-focus w-full rounded-md p-1 text-base focus:border-2 focus:border-dotted focus:outline-none"
                maxlength="1000"
                :placeholder="$t('modals.editCard.linksTitlePlaceholder')"
                type="text"
                @keypress.enter="submitLink"
              >
              <p v-if="linkError" class="text-sm text-red-500">
                {{ linkError }}
              </p>
              <div class="flex flex-row gap-2">
                <button
                  class="bg-elevation-2 bg-elevation-3-hover transition-button rounded-md px-3 py-1"
                  @click="submitLink"
                >
                  {{
                    editingLinkId
                      ? $t("modals.editCard.linksSave")
                      : $t("modals.editCard.linksAdd")
                  }}
                </button>
                <button
                  v-if="editingLinkId"
                  class="text-accent-hover transition-button px-3 py-1"
                  @click="resetLinkForm"
                >
                  {{ $t("modals.editCard.linksCancel") }}
                </button>
              </div>
            </div>
          </div>
          <div class="mt-4 flex flex-col pr-6">
            <h2 class="text-lg font-semibold">
              {{ $t("modals.editCard.tagsTitle") }}
            </h2>
            <vue-tags-input
              v-model="tag"
              :tags="tags"
              :autocomplete-items="filteredItems"
              placeholder="Add tag..."
              @tags-changed="updateTags"
              @before-adding-tag="beforeTagAdd"
            />
            <button
              class="bg-elevation-3 mt-2 w-fit rounded-md px-2 py-0.5 text-sm"
              @click="closeModalAndOpenTagEdit"
            >
              {{ $t("modals.editCard.tagsEdit") }}
            </button>
          </div>
        </div>
      </div>
    </template>
  </Modal>
</template>

<script setup lang="ts">
import type {
  Card,
  CardDocument,
  CardLink,
  ReminderLeadTime,
  Task,
  Tag,
} from "@/types/kanban-types";
import type { Ref } from "vue";

import emitter from "@/utils/emitter";
import { generateUniqueID } from "@/utils/idGenerator";
import { isReminderLeadTime } from "@/utils/reminders";
import { SwatchIcon } from "@heroicons/vue/24/outline";
import { CheckIcon, PlusIcon, XMarkIcon } from "@heroicons/vue/24/solid";
import {
  PhBell,
  PhCalendar,
  PhCheck,
  PhFileText,
  PhLink,
  PhPencilSimple,
  PhTrash,
  PhWarning,
  PhX,
} from "@phosphor-icons/vue";
import { message, open, save } from "@tauri-apps/plugin-dialog";
import { exists, remove, writeTextFile } from "@tauri-apps/plugin-fs";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuPortal,
  ContextMenuRoot,
  ContextMenuTrigger,
} from "radix-vue";
import {
  cardTitleToFileName,
  documentDisplayName,
  joinDocumentPath,
  normalizeDocumentPath,
} from "@/utils/documentPaths";
import {
  isAllowedLinkUrl,
  linkDisplayName,
  normalizeLinkUrl,
} from "@/utils/cardLinks";
import { vOnClickOutside } from "@vueuse/components";
//@ts-expect-error library has no types
import { Container, Draggable } from "vue3-smooth-dnd";
//@ts-expect-error library has no types
import { VueTagsInput } from "@vojtechlanka/vue-tags-input";
import { useSettingsStore } from "@/stores/settings";

const props = defineProps<{
  card: Card | null;
  columnId: string;
  globalTags: Array<Tag>;
}>();

const emit = defineEmits<{
  (e: "closeModal", columnID: string): void;
  (
    e: "setCardColor",
    columnID: string,
    cardId: string | undefined,
    color: string
  ): void;
  (
    e: "setCardDescription",
    columnID: string,
    cardId: string | undefined,
    description: string
  ): void;
  (
    e: "setCardDueDate",
    columnID: string,
    cardId: string | undefined,
    dueDate: Date | null,
    isCounterRelative: boolean,
    isCompleted: boolean
  ): void;
  (
    e: "setCardReminderLeadTime",
    columnID: string,
    cardId: string | undefined,
    leadTime: ReminderLeadTime | null
  ): void;
  (
    e: "setCardTags",
    columnID: string,
    cardId: string | undefined,
    tags: Array<Tag>
  ): void;
  (
    e: "setCardTasks",
    columnID: string,
    cardId: string | undefined,
    tasks: Array<Task>
  ): void;
  (
    e: "setCardTitle",
    columnID: string,
    cardId: string | undefined,
    title: string
  ): void;
  (e: "addGlobalTag", tag: Tag): void;
  (e: "openTagEdit"): void;
  (
    e: "addCardDocument",
    columnID: string,
    cardId: string | undefined,
    path: string
  ): void;
  (
    e: "removeCardDocument",
    columnID: string,
    cardId: string | undefined,
    documentId: string
  ): void;
  (
    e: "setCardDocumentPath",
    columnID: string,
    cardId: string | undefined,
    documentId: string,
    path: string
  ): void;
  (
    e: "openDocument",
    columnID: string,
    cardId: string | undefined,
    documentId: string
  ): void;
  (
    e: "addCardLink",
    columnID: string,
    cardId: string | undefined,
    url: string,
    title?: string
  ): void;
  (
    e: "updateCardLink",
    columnID: string,
    cardId: string | undefined,
    linkId: string,
    url: string,
    title?: string
  ): void;
  (
    e: "removeCardLink",
    columnID: string,
    cardId: string | undefined,
    linkId: string
  ): void;
}>();

const { locale, t } = useI18n();

const columnID = ref("");
const { textarea: titleTextArea, input: title } = useTextareaAutosize();
const description = ref("");
const tasks: Ref<Array<{ finished: boolean; id?: string; name: string }>> = ref(
  []
);
const selectedColor = ref("");

const dueDate: Ref<Date | null> = ref(null);
const isDueDateCounterRelative = ref(false);
const settingsStore = useSettingsStore();
const isDueDateCompleted = ref(false);
// "default" = no card setting, the global reminder lead time applies
const reminderLeadTime = ref<ReminderLeadTime | "default">("default");

const tag = ref("");
const tags: Ref<Array<Tag>> = ref([]);
const autocompleteItems: Ref<Array<Tag>> = ref([]);

const isCustomColor = computed(() => selectedColor.value.startsWith("#"));
const customColor = ref("#ffffff");
const showCustomColorPopup = ref(false);

const titleEditing = ref(false);

const newTaskName = ref("");
const taskAddMode = ref(false);
const newTaskInput: Ref<HTMLInputElement | null> = ref(null);

const currentlyEditingTaskIndex = ref(-1);
const currentlyEditingTaskName = ref("");
const taskEditMode = ref(false);

const draggingEnabled = ref(true);

const documents: Ref<Array<CardDocument>> = ref([]);
// result of the exists() check per document id; undefined = not checked yet
const documentExists: Ref<Record<string, boolean>> = ref({});
// document whose removal is awaiting confirmation (inline dialog)
const documentPendingRemoval: Ref<CardDocument | null> = ref(null);
let documentCheckGeneration = 0;
let lastCheckedDocumentsKey = "";

const links: Ref<Array<CardLink>> = ref([]);
const linkUrlInput: Ref<HTMLInputElement | null> = ref(null);
const linkUrlInputValue = ref("");
const linkTitleInputValue = ref("");
const linkError = ref("");
// id of the link currently loaded into the form for editing; null = form adds a new link
const editingLinkId: Ref<string | null> = ref(null);
let linkFormCardId: string | undefined = undefined;

const MARKDOWN_FILE_FILTERS = [
  { name: "Markdown", extensions: ["md", "markdown"] },
];

// the modal itself has z-index 10000000, so the context menu has to be above it
const documentContextMenuClass = computed(() => {
  let classes =
    "bg-primary-darker border-elevation-1 z-[10000001] min-w-[100px] rounded-md border p-[5px] shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] outline-none will-change-[opacity,transform]";

  if (settingsStore.animationsEnabled) {
    classes +=
      " data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade";
  }

  return classes;
});

const enableTitleEditing = () => {
  emitter.emit("modalPreventClickOutsideClose");
  titleEditing.value = true;
};

const enableTaskAddMode = () => {
  taskAddMode.value = true;
};

const filteredItems = computed(() => {
  const currentInput = tag.value.trim().toLowerCase();
  return autocompleteItems.value.filter((item) =>
    item.text.toLowerCase().includes(currentInput)
  );
});

const getCheckedTaskNumber = computed(() => {
  return tasks.value.filter((task) => task.finished).length || 0;
});

const getTaskPercentage = computed(() => {
  if (!tasks.value || tasks.value.length === 0) return 0;

  return (getCheckedTaskNumber.value / tasks.value.length) * 100;
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const beforeTagAdd = ({ tag, addTag }: any) => {
  // get all matches from autocomplete items (starts with), if it is only one, select it
  const matches = autocompleteItems.value.filter((item) =>
    item.text.toLowerCase().startsWith(tag.text.toLowerCase())
  );

  // check if autocomplete items have a tag with the same name
  const existingTag = autocompleteItems.value.find(
    (item) => item.text === tag.text
  );

  if (!existingTag) {
    if (matches.length === 1 && matches[0]) {
      tag.text = matches[0].text;
      tag.id = matches[0].id;
      tag.color = matches[0].color;
      tag.style = matches[0].style;
    } else {
      tag.id = generateUniqueID();
    }
  } else {
    tag.text = existingTag.text;
    tag.id = existingTag.id;
    tag.color = existingTag.color;
    tag.style = existingTag.style;
  }

  addTag();

  emit("addGlobalTag", tag);
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const updateTags = (newTags: any) => {
  tags.value = newTags;

  emit("setCardTags", columnID.value, props.card?.id, tags.value);
};

const closeModalAndOpenTagEdit = () => {
  emit("closeModal", columnID.value);
  titleEditing.value = false;
  taskAddMode.value = false;
  showCustomColorPopup.value = false;

  nextTick(() => {
    emit("openTagEdit");
  });
};

const createTask = () => {
  if (newTaskName.value == null || !/\S/.test(newTaskName.value)) return;

  tasks.value.push({
    finished: false,
    id: generateUniqueID(),
    name: newTaskName.value,
  });
  newTaskName.value = "";
  taskAddMode.value = false;

  updateCardTasks();
};

const deleteTask = (index: number) => {
  tasks.value.splice(index, 1);
  updateCardTasks();
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onTaskDrop = (dropResult: any) => {
  tasks.value = applyDrag(tasks.value, dropResult);
  updateCardTasks();
};

const enableTaskEditMode = (
  index: number,
  task: { finished: boolean; name: string }
) => {
  taskEditMode.value = true;
  draggingEnabled.value = false;
  currentlyEditingTaskIndex.value = index;
  currentlyEditingTaskName.value = task.name;
};

const updateTask = (index: number) => {
  const taskNameEmpty =
    currentlyEditingTaskName.value == null ||
    !/\S/.test(currentlyEditingTaskName.value);
  if (taskNameEmpty || currentlyEditingTaskIndex.value === -1) return;

  if (tasks.value[index]) {
    tasks.value[index].name = currentlyEditingTaskName.value;
  }

  currentlyEditingTaskIndex.value = -1;
  currentlyEditingTaskName.value = "";
  taskEditMode.value = false;
  draggingEnabled.value = true;

  updateCardTasks();
};

const updateCardTasks = () => {
  emit("setCardTasks", columnID.value, props.card?.id, tasks.value);
};

const resetDueDate = () => {
  dueDate.value = null;
  emit(
    "setCardDueDate",
    columnID.value,
    props.card?.id,
    null,
    isDueDateCounterRelative.value,
    false
  );
};

const markDueDateCompleted = () => {
  emit(
    "setCardDueDate",
    columnID.value,
    props.card?.id,
    dueDate.value,
    isDueDateCounterRelative.value,
    isDueDateCompleted.value
  );
};

const updateDueDate = () => {
  emit(
    "setCardDueDate",
    columnID.value,
    props.card?.id,
    dueDate.value,
    isDueDateCounterRelative.value,
    isDueDateCompleted.value
  );
};

const updateReminderLeadTime = (event: Event) => {
  const value = (event.target as HTMLSelectElement).value;
  const leadTime = isReminderLeadTime(value) ? value : null;
  reminderLeadTime.value = leadTime ?? "default";
  emit("setCardReminderLeadTime", columnID.value, props.card?.id, leadTime);
};

const updateDescription = () => {
  emit("setCardDescription", columnID.value, props.card?.id, description.value);
  emitter.emit("modalEnableClickOutsideClose");
};

const updateTitle = () => {
  emitter.emit("modalEnableClickOutsideClose");

  if (title.value == null || !/\S/.test(title.value)) return;

  titleEditing.value = false;
  emit("setCardTitle", columnID.value, props.card?.id, title.value);
};

const setCardColor = (
  columnID: string,
  cardId: string | undefined,
  color: string
) => {
  selectedColor.value = color;
  emit("setCardColor", columnID, props.card?.id, color);
};

/**
 * Card documents (Markdown files linked to the card)
 */

const isDocumentMissing = (documentId: string) =>
  documentExists.value[documentId] === false;

// a failing exists() (e.g. path outside the fs scope after an import) counts as missing
const checkDocumentsExist = async () => {
  const generation = ++documentCheckGeneration;
  const result: Record<string, boolean> = {};

  await Promise.all(
    documents.value.map(async (doc) => {
      try {
        result[doc.id] = await exists(doc.path);
      } catch (err) {
        console.warn("Could not check if document exists:", doc.path, err);
        result[doc.id] = false;
      }
    })
  );

  // ignore results of outdated checks (another card was opened meanwhile)
  if (generation === documentCheckGeneration) {
    documentExists.value = result;
  }
};

const documentsDialogDefaultPath = () =>
  settingsStore.markdownDocumentsFolder || undefined;

const addExistingDocuments = async () => {
  const selected = await open({
    multiple: true,
    directory: false,
    filters: MARKDOWN_FILE_FILTERS,
    defaultPath: documentsDialogDefaultPath(),
  });
  if (!selected) return;

  const paths = Array.isArray(selected) ? selected : [selected];
  for (const path of paths) {
    emit("addCardDocument", columnID.value, props.card?.id, path);
  }
};

const createNewDocument = async () => {
  if (!props.card) return;
  const cardTitle = props.card.name;

  const path = await save({
    defaultPath: joinDocumentPath(
      settingsStore.markdownDocumentsFolder,
      cardTitleToFileName(cardTitle)
    ),
    filters: MARKDOWN_FILE_FILTERS,
  });
  if (!path) return;

  try {
    await writeTextFile(path, `# ${cardTitle}\n`);
  } catch (err) {
    console.error("Could not create document:", err);
    await message(String(err), { title: "Kanri", kind: "error" });
    return;
  }

  emit("addCardDocument", columnID.value, props.card.id, path);

  // the store mutated the card synchronously, look up the (new or existing) reference
  const normalized = normalizeDocumentPath(path);
  const doc = props.card.documents?.find(
    (d) => normalizeDocumentPath(d.path) === normalized
  );
  if (doc) {
    emitOpenDocument(doc.id);
  }
};

const emitOpenDocument = (documentId: string) => {
  titleEditing.value = false;
  taskAddMode.value = false;
  showCustomColorPopup.value = false;
  emit("openDocument", columnID.value, props.card?.id, documentId);
};

const openDocument = (doc: CardDocument) => {
  if (isDocumentMissing(doc.id)) return;
  emitOpenDocument(doc.id);
};

const revealDocument = (doc: CardDocument) => {
  revealItemInDir(doc.path).catch((err) =>
    console.error("Could not reveal document:", err)
  );
};

const openDocumentExternally = (doc: CardDocument) => {
  openPath(doc.path).catch((err) => {
    console.error("Could not open document externally:", err);
    message(String(err), { kind: "error" });
  });
};

const relinkDocument = async (doc: CardDocument) => {
  const selected = await open({
    multiple: false,
    directory: false,
    filters: MARKDOWN_FILE_FILTERS,
    defaultPath: documentsDialogDefaultPath(),
  });
  if (!selected || Array.isArray(selected)) return;

  emit("setCardDocumentPath", columnID.value, props.card?.id, doc.id, selected);
};

const detachDocument = (doc: CardDocument) => {
  emit("removeCardDocument", columnID.value, props.card?.id, doc.id);
};

// a missing file has nothing to delete, so the link is removed without asking
const removeDocument = (doc: CardDocument) => {
  if (isDocumentMissing(doc.id)) {
    detachDocument(doc);
    return;
  }

  documentPendingRemoval.value = doc;
};

const confirmRemoveDocument = async (deleteFile: boolean) => {
  const doc = documentPendingRemoval.value;
  if (!doc) return;

  documentPendingRemoval.value = null;

  if (deleteFile) {
    try {
      await remove(doc.path);
    } catch (err) {
      // keep the link so the user can retry or detach only
      console.error("Could not delete document:", doc.path, err);
      message(`${t("modals.editCard.documentDeleteFailed")}\n${String(err)}`, {
        kind: "error",
      });
      return;
    }
  }

  detachDocument(doc);
};

/**
 * Card links (web URLs opened in the default browser)
 */

const resetLinkForm = () => {
  linkUrlInputValue.value = "";
  linkTitleInputValue.value = "";
  linkError.value = "";
  editingLinkId.value = null;
};

const submitLink = () => {
  const result = normalizeLinkUrl(linkUrlInputValue.value);
  if (!result.ok) {
    if (result.error === "scheme") {
      linkError.value = t("modals.editCard.linksInvalidScheme");
    } else if (result.error === "invalid") {
      linkError.value = t("modals.editCard.linksInvalidUrl");
    }
    return;
  }

  const title = linkTitleInputValue.value.trim() || undefined;
  const editingId = editingLinkId.value;
  if (editingId && links.value.some((l) => l.id === editingId)) {
    emit("updateCardLink", columnID.value, props.card?.id, editingId, result.url, title);
  } else {
    emit("addCardLink", columnID.value, props.card?.id, result.url, title);
  }

  resetLinkForm();
};

const openLink = (link: CardLink) => {
  if (!isAllowedLinkUrl(link.url)) {
    message(`${t("modals.editCard.linksOpenFailed")}\n${t("modals.editCard.linksInvalidScheme")}`, {
      kind: "error",
    });
    return;
  }

  openUrl(link.url).catch((err) => {
    console.error("Could not open link:", link.url, err);
    message(`${t("modals.editCard.linksOpenFailed")}\n${String(err)}`, {
      kind: "error",
    });
  });
};

// navigator.clipboard is available in the Tauri WebView (*.localhost is a secure context);
// the execCommand fallback covers a missing or rejecting Clipboard API
const copyLinkUrl = async (link: CardLink) => {
  try {
    await navigator.clipboard.writeText(link.url);
    return;
  } catch (err) {
    console.warn("Clipboard API failed, falling back to execCommand:", err);
  }

  const textarea = document.createElement("textarea");
  textarea.value = link.url;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) {
      console.error("Could not copy link URL to the clipboard");
    }
  } catch (err) {
    console.error("Could not copy link URL to the clipboard:", err);
  } finally {
    document.body.removeChild(textarea);
  }
};

const startLinkEdit = (link: CardLink) => {
  editingLinkId.value = link.id;
  linkUrlInputValue.value = link.url;
  linkTitleInputValue.value = link.title ?? "";
  linkError.value = "";

  // the context menu returns focus to its trigger when it closes, focus the field afterwards
  setTimeout(() => linkUrlInput.value?.focus(), 0);
};

const removeLink = (link: CardLink) => {
  if (editingLinkId.value === link.id) resetLinkForm();
  emit("removeCardLink", columnID.value, props.card?.id, link.id);
};

// re-check on every opening, files may have been renamed or deleted in the meantime
const onEditCardModalOpened = () => {
  checkDocumentsExist();
};

// capture phase, so Escape closes only the inline dialog and not the whole modal
const documentDialogKeyDownListener = (e: KeyboardEvent) => {
  if (!documentPendingRemoval.value) return;

  if (e.key === "Escape") {
    documentPendingRemoval.value = null;
    e.stopImmediatePropagation();
  } else if (e.key === "Enter") {
    e.stopImmediatePropagation();
  }
};

onMounted(() => {
  emitter.on("editCardModalOpened", onEditCardModalOpened);
  document.addEventListener("keydown", documentDialogKeyDownListener, true);
});

onBeforeUnmount(() => {
  emitter.off("editCardModalOpened", onEditCardModalOpened);
  document.removeEventListener("keydown", documentDialogKeyDownListener, true);
});

const dateToLocalFormat = (date: Date | string) => {
  const jsLocaleIdentifier = locale.value.replace("_", "-")

  if (typeof date === "string") {
    return new Date(date).toLocaleDateString(jsLocaleIdentifier);
  }
  return date.toLocaleDateString(jsLocaleIdentifier);
};

watch(customColor, (newVal, oldVal) => {
  if (newVal !== oldVal) {
    setCardColor(columnID.value, props.card?.id, newVal);
  }
});

watch(props, (newVal) => {
  if (newVal) {
    if (!newVal.card) return;

    newTaskName.value = "";

    columnID.value = newVal.columnId;

    title.value = newVal.card.name;
    description.value = newVal.card.description || "";

    //@ts-expect-error TODO: improve due date handling/types
    dueDate.value = newVal.card.dueDate || null;
    isDueDateCounterRelative.value =
      newVal.card.isDueDateCounterRelative !== undefined
        ? newVal.card.isDueDateCounterRelative
        : settingsStore.defaultRelativeDueDatesEnabled;
    isDueDateCompleted.value = newVal.card.isDueDateCompleted || false;
    reminderLeadTime.value = isReminderLeadTime(newVal.card.reminderLeadTime)
      ? newVal.card.reminderLeadTime
      : "default";

    tags.value = newVal.card.tags || [];
    tag.value = "";
    autocompleteItems.value = newVal.globalTags;

    /**
     * Enforce adding IDs to all card tasks
     * TODO: Potentially remove later on in a version with breaking change to make ID non-optional
     */
    const savedTasks = newVal.card.tasks || [];
    if (savedTasks.length > 0) {
      savedTasks.forEach((task) => {
        if (!task.id) {
          console.log("Generating ID for old task, this should not happen again");
          task.id = generateUniqueID();
        }
      });
    }
    tasks.value = savedTasks;

    /**
     * Document references from hand-written imports may lack an ID (the import schema allows it)
     */
    const savedDocuments = newVal.card.documents || [];
    savedDocuments.forEach((doc) => {
      if (!doc.id) doc.id = generateUniqueID();
    });
    documents.value = savedDocuments;
    // the deep props watcher fires on every card change; only re-check when the card or its paths changed
    // (renames on disk are covered by the re-check on every modal opening)
    const documentsKey = `${newVal.card.id}|${savedDocuments.map((doc) => doc.path).join("|")}`;
    if (documentsKey !== lastCheckedDocumentsKey) {
      lastCheckedDocumentsKey = documentsKey;
      checkDocumentsExist();
    }

    // same array instance as in the store, so in-place mutations by the store show up here
    const savedLinks = newVal.card.links || [];
    savedLinks.forEach((link) => {
      if (!link.id) link.id = generateUniqueID();
    });
    links.value = savedLinks;
    // the deep props watcher fires on every card change; only drop the form when another card is shown
    if (newVal.card.id !== linkFormCardId) {
      linkFormCardId = newVal.card.id;
      resetLinkForm();
    }

    selectedColor.value = newVal.card.color || "bg-elevation-2";
    if (newVal.card.color?.startsWith("#")) {
      customColor.value = newVal.card.color;
    }
  }
});
</script>

<style>
.v-popper__popper {
  z-index: 9999999999 !important;
}

.vue-tags-input {
  background-color: var(--elevation-1) !important;
  max-width: none !important;
}

.vue-tags-input .ti-new-tag-input {
  background: transparent;
  color: var(--text-dim-1);
}

.vue-tags-input .ti-input {
  padding: 8px 4px !important;
  background: var(--elevation-1);

  border: 1px solid var(--elevation-3) !important;
  border-radius: 8px;
}

.vue-tags-input ::-webkit-input-placeholder {
  color: var(--text-dim-3);
}

.vue-tags-input ::-moz-placeholder {
  color: var(--text-dim-3);
}

.vue-tags-input :-ms-input-placeholder {
  color: var(--text-dim-3);
}

.vue-tags-input :-moz-placeholder {
  color: var(--text-dim-3);
}

.vue-tags-input .ti-autocomplete {
  background: var(--elevation-2);
  border: 1px solid var(--elevation-3);
  border-top: none;
  border-radius: 0 0 8px 8px;

  z-index: 9999999999 !important;
  overflow: visible;

  position: unset !important;
}

.vue-tags-input .ti-tag {
  position: relative;
  background: var(--elevation-3);
}

.vc-light {
  /* Base */
  --vc-color: var(--text);
  --vc-bg: var(--bg-primary);
  --vc-border: var(--elevation-1);
  --vc-hover-bg: hsla(211, 25%, 84%, 0.3);
  --vc-focus-ring: 0 0 0 2px rgb(59, 131, 246, 0.4);
  /* Calendar header */
  --vc-header-arrow-color: var(--text-dim-2);
  --vc-header-arrow-hover-bg: var(--elevation-2);
  --vc-header-title-color: var(--accent);
  /* Calendar weekdays */
  --vc-weekday-color: var(--text-dim-3);
  /* Calendar weeknumbers */
  --vc-weeknumber-color: var(--vc-gray-400);
  /* Calendar nav */
  --vc-nav-hover-bg: var(--vc-gray-200);
  --vc-nav-title-color: var(--vc-gray-900);
  --vc-nav-item-hover-box-shadow: none;
  --vc-nav-item-active-color: var(--vc-white);
  --vc-nav-item-active-bg: var(--vc-accent-500);
  --vc-nav-item-active-box-shadow: var(--vc-shadow);
  --vc-nav-item-current-color: var(--vc-accent-600);
  /* Calendar day popover */
  --vc-day-popover-container-color: var(--vc-white);
  --vc-day-popover-container-bg: var(--vc-gray-800);
  --vc-day-popover-container-border: var(--vc-gray-700);
  --vc-day-popover-header-color: var(--vc-gray-700);
  /* Popover content */
  --vc-popover-content-color: var(--vc-gray-900);
  --vc-popover-content-bg: var(--vc-gray-50);
  --vc-popover-content-border: var(--elevation-2);
  /* Time picker */
  --vc-time-picker-border: var(--elevation-1);
  --vc-time-weekday-color: var(--text-dim-3);
  --vc-time-month-color: var(--accent);
  --vc-time-day-color: var(--accent);
  --vc-time-year-color: var(--text-dim-3);
  /* Time select group */
  --vc-time-select-group-bg: var(--elevation-1);
  --vc-time-select-group-border: var(--elevation-2);
  --vc-time-select-group-icon-color: var(--accent);
  /* Base select */
  --vc-select-color: var(--text);
  --vc-select-bg: var(--elevation-1);
  --vc-select-hover-bg: var(--elevation-2);
  /* Calendar day */
  --vc-day-content-hover-bg: var(--elevation-2);
  --vc-day-content-disabled-color: var(--vc-gray-400);
  /* Calendar attributes */
  &.vc-attr,
  & .vc-attr {
    --vc-content-color: var(--vc-accent-600);
    --vc-highlight-outline-bg: var(--vc-white);
    --vc-highlight-outline-border: var(--accent);
    --vc-highlight-outline-content-color: var(--vc-accent-700);
    --vc-highlight-light-bg: var(--vc-accent-200);
    --vc-highlight-light-content-color: var(--vc-accent-900);
    --vc-highlight-solid-bg: var(--accent);
    --vc-highlight-solid-content-color: var(--vc-white);
    --vc-dot-bg: var(--accent);
    --vc-bar-bg: var(--accent);
  }
}

.vc-day.is-today .vc-day-content {
  border: 1.5px solid var(--accent);
  border-radius: 100%;
}
</style>

<style scoped>
textarea {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

textarea::-webkit-scrollbar {
  display: none;
}

input[type="color"] {
  -webkit-appearance: none;
  appearance: none;
  border-radius: 8px;
  cursor: pointer;
}
input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
  border-radius: 8px;
}
input[type="color"]::-webkit-color-swatch {
  border-radius: 8px;
  border-width: 2px;
  border-style: solid;
  border-color: var(--text);
}
</style>
