@file:Suppress("FunctionName", "ClassName", "unused", "EnumEntryName", "UnusedImport")
package com.sourcegraph.cody.protocol_generated

import com.google.gson.annotations.SerializedName

data class ClientCapabilities(
  val completions: CompletionsEnum? = null, // Oneof: none
  val chat: ChatEnum? = null, // Oneof: none, streaming
  val git: GitEnum? = null, // Oneof: none, enabled
  val progressBars: ProgressBarsEnum? = null, // Oneof: none, enabled
  val edit: EditEnum? = null, // Oneof: none, enabled
  val editWorkspace: EditWorkspaceEnum? = null, // Oneof: none, enabled
  val showDocument: ShowDocumentEnum? = null, // Oneof: none, enabled
  val codeLenses: CodeLensesEnum? = null, // Oneof: none, enabled
  val showWindowMessage: ShowWindowMessageEnum? = null, // Oneof: notification, request
  val ignore: IgnoreEnum? = null, // Oneof: none, enabled
  val codeActions: CodeActionsEnum? = null, // Oneof: none, enabled
) {

  enum class CompletionsEnum {
    @SerializedName("none") None,
  }

  enum class ChatEnum {
    @SerializedName("none") None,
    @SerializedName("streaming") Streaming,
  }

  enum class GitEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class ProgressBarsEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class EditEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class EditWorkspaceEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class ShowDocumentEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class CodeLensesEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class ShowWindowMessageEnum {
    @SerializedName("notification") Notification,
    @SerializedName("request") Request,
  }

  enum class IgnoreEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }

  enum class CodeActionsEnum {
    @SerializedName("none") None,
    @SerializedName("enabled") Enabled,
  }
}

